import { useRef, useCallback, useState, useEffect } from "react";
import type { Socket } from "socket.io-client";

export interface CaptionLine {
  id: number;
  speaker: string;
  text: string;
  interim: string;
  timestamp: number;
  isLocal: boolean;
}

export interface UseCaptionsReturn {
  captionsEnabled: boolean;
  captions: CaptionLine[];
  toggleCaptions: () => void;
  supported: boolean;
  error: string | null;
  addRemoteCaption: (speaker: string, text: string, interim: boolean) => void;
}

type SpeechRecognitionEvent = Event & {
  resultIndex: number;
  results: SpeechRecognitionResultList;
};
type SpeechRecognitionErrorEvent = Event & { error: string };

interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

const MAX_LINES = 5;
const LINE_EXPIRE_MS = 20000;  // Keep captions visible for 20 seconds  

let captionIdCounter = 0;

export function useCaptions(
  localDisplayName: string,
  socket: Socket | null,
  roomCode: string | null,
  peerId: string | null
): UseCaptionsReturn {
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [captions, setCaptions] = useState<CaptionLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const enabledRef = useRef(false);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localLineIdRef = useRef<number | null>(null);
  const remoteCaptionIdsRef = useRef<Map<string, number>>(new Map()); // Track remote caption IDs by peerId

  const SpeechRecognitionCtor =
    typeof window !== "undefined"
      ? window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null
      : null;

  const supported = !!SpeechRecognitionCtor;

  const expireOldLines = useCallback(() => {
    const now = Date.now();
    setCaptions((prev) =>
      prev.filter((l) => {
        
        if (l.interim !== "") return true;
        
        return now - l.timestamp < LINE_EXPIRE_MS;
      })
    );
  }, []);

  useEffect(() => {
    if (!captionsEnabled) return;
    const interval = setInterval(expireOldLines, 2000);
    return () => clearInterval(interval);
  }, [captionsEnabled, expireOldLines]);

  const upsertLine = useCallback(
    (id: number, speaker: string, text: string, interim: string, isLocal: boolean = true) => {
      setCaptions((prev) => {
        const existing = prev.find((l) => l.id === id);
        if (existing) {
          return prev.map((l) =>
            l.id === id ? { ...l, text, interim, timestamp: Date.now(), isLocal } : l
          );
        }
        const newLine: CaptionLine = {
          id,
          speaker,
          text,
          interim,
          timestamp: Date.now(),
          isLocal,
        };
        const updated = [...prev, newLine];
        return updated.slice(-MAX_LINES);
      });
    },
    []
  );

  const addRemoteCaption = useCallback(
    (speaker: string, text: string, interim: boolean) => {
      // Use a unique key for each remote speaker to track their caption line
      const captionKey = `remote-${speaker}`;
      let id = remoteCaptionIdsRef.current.get(captionKey);
      
      if (!id || !interim) {
        // Create new caption ID for new final text or if no ID exists
        captionIdCounter += 1;
        id = captionIdCounter;
        remoteCaptionIdsRef.current.set(captionKey, id);
      }
      
      upsertLine(id, speaker, interim ? "" : text, interim ? text : "", false);
      
      if (!interim) {
        // After final text, clear the ID so next caption gets a new line
        setTimeout(() => {
          remoteCaptionIdsRef.current.delete(captionKey);
        }, 100);
      }
    },
    [upsertLine]
  );

  const startRecognition = useCallback(() => {
    if (!SpeechRecognitionCtor || !enabledRef.current) {
      console.log('[Captions] Cannot start: SpeechRecognition not available or disabled');
      return;
    }

    // Stop any existing recognition first
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {
        console.log('[Captions] Error stopping existing recognition:', e);
      }
      recognitionRef.current = null;
    }

    try {
      const recognition = new SpeechRecognitionCtor();
      recognition.lang = "en-US";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognitionRef.current = recognition;

      recognition.onstart = () => {
        console.log('[Captions] ✓ Speech recognition started successfully');
        setError(null);
      };

      recognition.onresult = (e: SpeechRecognitionEvent) => {
        if (!enabledRef.current) return;

        let interimText = "";
        let finalText = "";

        for (let i = e.resultIndex; i < e.results.length; i++) {
          const result = e.results[i];
          const transcript = result[0].transcript;
          if (result.isFinal) {
            finalText += transcript;
          } else {
            interimText += transcript;
          }
        }

        console.log('[Captions] Result - Final:', finalText, 'Interim:', interimText);

        if (finalText) {
          if (localLineIdRef.current === null) {
            captionIdCounter += 1;
            localLineIdRef.current = captionIdCounter;
          }
          upsertLine(localLineIdRef.current, localDisplayName, finalText, "", true);
          
          // Broadcast final caption to other participants
          if (socket && roomCode && peerId) {
            socket.emit("caption", {
              roomCode,
              peerId,
              displayName: localDisplayName,
              text: finalText,
              interim: false,
            });
            console.log('[Captions] Broadcasted final caption:', finalText);
          }
          
          // Reset line ID after final text so next caption gets a new line
          localLineIdRef.current = null;
        }

        if (interimText && !finalText) {
          if (localLineIdRef.current === null) {
            captionIdCounter += 1;
            localLineIdRef.current = captionIdCounter;
          }
          upsertLine(localLineIdRef.current, localDisplayName, "", interimText, true);
          
          // Broadcast interim caption to other participants
          if (socket && roomCode && peerId) {
            socket.emit("caption", {
              roomCode,
              peerId,
              displayName: localDisplayName,
              text: interimText,
              interim: true,
            });
          }
        }
      };

      recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
        console.error('[Captions] Speech recognition error:', e.error);
        
        // Handle different error types appropriately
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          setError("Microphone access denied. Please allow microphone permission in your browser.");
          enabledRef.current = false;
          setCaptionsEnabled(false);
          stopRecognition();
        } else if (e.error === "no-speech") {
          console.log('[Captions] No speech detected, will continue listening...');
          // Don't show error or stop - this is normal during pauses
        } else if (e.error === "audio-capture") {
          console.warn('[Captions] Audio capture failed - microphone might be in use');
          // Don't stop, let it retry - the meeting uses the mic but speech recognition can still work
        } else if (e.error === "network") {
          console.warn('[Captions] Network error for speech recognition');
          setError("Speech recognition network error. Will retry...");
          // Don't stop completely, let auto-restart handle it
        } else if (e.error === "aborted") {
          console.log('[Captions] Recognition aborted (normal during stop)');
        } else if (e.error === "language-not-supported") {
          setError("Speech recognition language not supported.");
          enabledRef.current = false;
          setCaptionsEnabled(false);
        } else {
          console.warn('[Captions] Recognition error:', e.error);
          // For other errors, log but don't stop - let auto-restart handle recovery
        }
      };

      recognition.onend = () => {
        console.log('[Captions] Speech recognition ended, restart needed:', enabledRef.current);
        // Clear the reference
        recognitionRef.current = null;
        
        // Auto-restart if still enabled
        if (enabledRef.current) {
          // Use a slightly longer delay to avoid rapid restart loops
          restartTimerRef.current = setTimeout(() => {
            if (enabledRef.current && !recognitionRef.current) {
              console.log('[Captions] Auto-restarting speech recognition after natural end...');
              startRecognition();
            }
          }, 1000);
        }
      };

      console.log('[Captions] Attempting to start speech recognition...');
      recognition.start();
    } catch (err) {
      console.error('[Captions] Failed to start recognition:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Failed to start captions: ${errorMessage}`);
      
      // Retry after a delay if still enabled
      if (enabledRef.current) {
        restartTimerRef.current = setTimeout(() => {
          if (enabledRef.current) {
            console.log('[Captions] Retrying after error...');
            startRecognition();
          }
        }, 2000);
      }
    }
  }, [SpeechRecognitionCtor, localDisplayName, upsertLine, socket, roomCode, peerId]);

  const stopRecognition = useCallback(() => {
    console.log('[Captions] Stopping recognition...');
    
    // Clear any restart timers
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    
    // Stop the recognition instance
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
        console.log('[Captions] Recognition stopped successfully');
      } catch (err) {
        console.log('[Captions] Error stopping recognition:', err);
      }
      recognitionRef.current = null;
    }
    
    localLineIdRef.current = null;
  }, []);

  const toggleCaptions = useCallback(() => {
    if (!SpeechRecognitionCtor) {
      setError("Live captions are not supported in this browser. Try Chrome or Edge.");
      return;
    }
    
    // Check if running on HTTPS or localhost
    const isSecure = window.isSecureContext || 
                     window.location.hostname === 'localhost' || 
                     window.location.hostname === '127.0.0.1';
    
    if (!isSecure) {
      setError("Captions require HTTPS or localhost for security reasons.");
      return;
    }
    
    const next = !captionsEnabled;
    
    if (next) {
      console.log('[Captions] Enabling captions...');
      // Speech Recognition API handles microphone access internally
      // No need to call getUserMedia separately as it would conflict with the meeting's audio
      enabledRef.current = next;
      setCaptionsEnabled(next);
      setError(null);
      setCaptions([]);
      
      // Start recognition immediately - it will handle permissions internally
      console.log('[Captions] Starting speech recognition...');
      startRecognition();
    } else {
      console.log('[Captions] Disabling captions...');
      enabledRef.current = next;
      setCaptionsEnabled(next);
      setError(null);
      stopRecognition();
      setCaptions([]);
    }
  }, [captionsEnabled, SpeechRecognitionCtor, startRecognition, stopRecognition]);

  useEffect(() => {
    return () => {
      enabledRef.current = false;
      stopRecognition();
    };
  }, [stopRecognition]);

  // Listen for remote captions from other participants
  useEffect(() => {
    if (!socket) return;

    const handleRemoteCaption = (data: {
      peerId: string;
      displayName: string;
      text: string;
      interim: boolean;
    }) => {
      // Don't process our own captions
      if (data.peerId === peerId) return;
      
      console.log('[Captions] Received remote caption from', data.displayName, ':', data.text, 'interim:', data.interim);
      addRemoteCaption(data.displayName, data.text, data.interim);
    };

    socket.on("caption", handleRemoteCaption);

    return () => {
      socket.off("caption", handleRemoteCaption);
    };
  }, [socket, peerId, addRemoteCaption]);

  return {
    captionsEnabled,
    captions,
    toggleCaptions,
    supported,
    error,
    addRemoteCaption,
  };
}
