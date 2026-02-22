import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Mic, MicOff, Video, VideoOff, PhoneOff, MessageSquare, Users,
  Smile, Circle, StopCircle, ScanFace, Volume2, VolumeX,
  Link2, Settings, Check, X, FlipHorizontal, Captions, CaptionsOff,
} from "lucide-react";
import { WebRTCManager, PeerConnection } from "@/lib/webrtc";
import { generatePeerId, getOrCreatePeerId } from "@/lib/meetUtils";
import type { Reaction } from "@/lib/meetUtils";
import { useMeetRecorder, RecordingMode } from "@/hooks/useMeetRecorder";
import { useCaptions } from "@/hooks/useCaptions";
import { getSocket, disconnectSocket } from "@/lib/socket";
import { toast } from "@/components/ui/sonner";
import VideoTile from "@/components/VideoTile";
import ChatPanel from "@/components/ChatPanel";
import ParticipantsList from "@/components/ParticipantsList";
import ReactionsPanel from "@/components/ReactionsPanel";
import LeaveModal from "@/components/LeaveModal";

type SidePanel = "chat" | "participants" | null;
type ActiveReaction = Reaction & { peerId: string; instanceId: number; offsetX: number };
type EmojiParticle = {
  id: number;
  emoji: string;
  x: number;
  delay: number;
  size: number;
  drift: number;
};

const ScreenShareIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" fill="none"/>
    <path d="M8 21h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    <path d="M12 17v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    <path d="M9 10l3-3 3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M12 7v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
);

const Tooltip: React.FC<{ text: string; children: React.ReactNode }> = ({ text, children }) => (
  <div className="meet-tooltip-wrap">{children}<span className="meet-tooltip">{text}</span></div>
);

const DualVUMeter: React.FC<{ stream: MediaStream | null; isMuted: boolean }> = ({ stream, isMuted }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserLRef = useRef<AnalyserNode | null>(null);
  const analyserRRef = useRef<AnalyserNode | null>(null);
  const dataLRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const dataRRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const peakRef = useRef({ L: 0, R: 0 });
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!stream || stream === streamRef.current) return;
    streamRef.current = stream;
    if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null; }
    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    const splitter = audioCtx.createChannelSplitter(2);
    const aL = audioCtx.createAnalyser(); aL.fftSize = 1024; aL.smoothingTimeConstant = 0.78;
    const aR = audioCtx.createAnalyser(); aR.fftSize = 1024; aR.smoothingTimeConstant = 0.78;
    analyserLRef.current = aL;
    analyserRRef.current = aR;
    dataLRef.current = new Uint8Array(aL.frequencyBinCount);
    dataRRef.current = new Uint8Array(aR.frequencyBinCount);
    peakRef.current = { L: 0, R: 0 };
    try {
      const src = audioCtx.createMediaStreamSource(stream);
      src.connect(splitter);
      splitter.connect(aL, 0);
      splitter.connect(aR, 1);
    } catch {
      const src = audioCtx.createMediaStreamSource(stream);
      src.connect(aL);
      src.connect(aR);
    }
    return () => { audioCtx.close(); audioCtxRef.current = null; };
  }, [stream]);

  useEffect(() => {
    cancelAnimationFrame(animRef.current);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    const barH = (H - 8) / 2;
    const barW = W - 44;
    const X0 = 32;

    const drawSilent = () => {
      ctx.clearRect(0, 0, W, H);
      for (let ch = 0; ch < 2; ch++) {
        const y = ch === 0 ? 2 : barH + 6;
        ctx.fillStyle = "rgba(255,255,255,0.05)";
        ctx.beginPath();
        ctx.roundRect(X0, y, barW, barH, 3);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.28)";
        ctx.font = "8px 'SF Mono', monospace";
        ctx.textAlign = "right";
        ctx.fillText(ch === 0 ? "L" : "R", 26, y + barH - 2);
      }
    };

    if (isMuted || !analyserLRef.current || !analyserRRef.current) { drawSilent(); return; }

    const aL = analyserLRef.current;
    const aR = analyserRRef.current;
    const dL = dataLRef.current!;
    const dR = dataRRef.current!;

    const drawChannel = (level: number, peak: number, y: number, label: string) => {
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.beginPath(); ctx.roundRect(X0, y, barW, barH, 3); ctx.fill();
      if (level > 0.001) {
        const grad = ctx.createLinearGradient(X0, 0, X0 + barW, 0);
        grad.addColorStop(0, "#22c55e"); grad.addColorStop(0.6, "#4ade80");
        grad.addColorStop(0.78, "#facc15"); grad.addColorStop(0.90, "#fb923c"); grad.addColorStop(1, "#ef4444");
        ctx.fillStyle = grad;
        ctx.save(); ctx.beginPath(); ctx.roundRect(X0, y, barW, barH, 3); ctx.clip();
        ctx.fillRect(X0, y, barW * level, barH); ctx.restore();
      }
      if (peak > 0.015) {
        const px = X0 + barW * Math.min(peak, 1) - 2;
        ctx.fillStyle = peak > 0.85 ? "#ef4444" : "rgba(255,255,255,0.85)";
        ctx.beginPath(); ctx.roundRect(px, y + 1, 3, barH - 2, 1); ctx.fill();
      }
      ctx.fillStyle = "rgba(255,255,255,0.30)"; ctx.font = "8px 'SF Mono', monospace";
      ctx.textAlign = "right"; ctx.fillText(label, 26, y + barH - 2);
      const db = level > 0.001 ? Math.max(-60, Math.min(0, 20 * Math.log10(level))) : -60;
      ctx.fillStyle = level > 0.85 ? "#ef4444" : "rgba(255,255,255,0.42)";
      ctx.font = "bold 8px 'SF Mono', monospace"; ctx.textAlign = "left";
      ctx.fillText(`${Math.round(db)}`, W - 10, y + barH - 2);
    };

    const draw = () => {
      animRef.current = requestAnimationFrame(draw);
      ctx.clearRect(0, 0, W, H);
      aL.getByteFrequencyData(dL); aR.getByteFrequencyData(dR);
      const levelL = Math.min(1, dL.reduce((a, b) => a + b, 0) / dL.length / 255 * 3);
      const levelR = Math.min(1, dR.reduce((a, b) => a + b, 0) / dR.length / 255 * 3);
      peakRef.current.L = Math.max(levelL, peakRef.current.L - 0.004);
      peakRef.current.R = Math.max(levelR, peakRef.current.R - 0.004);
      drawChannel(levelL, peakRef.current.L, 2, "L");
      drawChannel(levelR, peakRef.current.R, barH + 6, "R");
      ctx.fillStyle = "rgba(255,255,255,0.1)";
      [-6, -12, -18, -24, -36].forEach((db) => {
        const ratio = 1 + db / 60;
        const x = X0 + barW * ratio;
        ctx.fillRect(x, (H / 2) - 1, 1, 3);
      });
    };
    draw();
    return () => { cancelAnimationFrame(animRef.current); };
  }, [isMuted, stream]);

  return <canvas ref={canvasRef} width={340} height={36} className="rounded-md" style={{ display: "block" }} />;
};

const LoadingScreen: React.FC = () => (
  <div className="meet-room flex items-center justify-center min-h-screen">
    <div className="flex flex-col items-center gap-10">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-xl text-white" style={{ background: "linear-gradient(135deg,#16a34a,#15803d)" }}>E</div>
        <span className="text-meet-text font-bold text-2xl tracking-tight">Elexico Meet</span>
      </div>
      <div className="flex flex-col items-center gap-6">
        <div className="flex items-end gap-1.5" style={{ height: 40 }}>
          {[0,1,2,3,4,5,6].map((i) => (
            <div key={i} className="rounded-full" style={{ width: 5, height: 40, background: "linear-gradient(180deg, #4ade80, #16a34a)", animation: "loading-bar 1.1s ease-in-out infinite", animationDelay: `${i * 0.1}s` }} />
          ))}
        </div>
        <div className="text-center">
          <p className="text-meet-text text-sm font-semibold tracking-wide">Joining meeting</p>
          <p className="text-meet-text-muted text-xs mt-1.5">Setting up secure connection...</p>
        </div>
      </div>
    </div>
  </div>
);

const isMobileDevice = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

const RemoteScreenVideo: React.FC<{ stream: MediaStream | null; isSpeakerMuted: boolean }> = ({ stream, isSpeakerMuted }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (stream) {
      video.srcObject = stream;
      video.muted = isSpeakerMuted;
      video.play().catch(() => {});
    } else {
      video.srcObject = null;
    }
  }, [stream, isSpeakerMuted]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={isSpeakerMuted}
      data-remote="true"
      className="w-full h-full object-contain"
    />
  );
};

const MeetingRoom: React.FC = () => {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();

  // Redirect if no room code
  useEffect(() => {
    if (!roomCode) {
      console.error('[MeetingRoom] No room code provided, redirecting to home');
      navigate('/');
    }
  }, [roomCode, navigate]);

  const managerRef = useRef<WebRTCManager | null>(null);
  const peerIdRef = useRef<string>(roomCode ? getOrCreatePeerId(roomCode) : generatePeerId());
  const audioTrackRef = useRef<MediaStreamTrack | null>(null);
  const camTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenVideoElRef = useRef<HTMLVideoElement>(null);
  const meetingRoomRef = useRef<HTMLDivElement>(null);
  const silentCtxRef = useRef<AudioContext | null>(null);

  const [peers, setPeers] = useState<PeerConnection[]>([]);
  const [isMuted, setIsMuted] = useState(true);
  const [isCameraOff, setIsCameraOff] = useState(true);
  const [isMicLocked, setIsMicLocked] = useState(false);
  const [isCameraLocked, setIsCameraLocked] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [presentationMuted, setPresentationMuted] = useState(false);
  const [blurIntensity, setBlurIntensity] = useState(0);
  const [showBlurSlider, setShowBlurSlider] = useState(false);
  const [sidePanel, setSidePanel] = useState<SidePanel>(null);
  const [showReactions, setShowReactions] = useState(false);
  const [showRecordMenu, setShowRecordMenu] = useState(false);
  const [showDeviceMenu, setShowDeviceMenu] = useState(false);
  const [reactions, setReactions] = useState<ActiveReaction[]>([]);
  const [emojiParticles, setEmojiParticles] = useState<EmojiParticle[]>([]);
  const particleCounterRef = useRef(0);
  const [isHost, setIsHost] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [unreadChat, setUnreadChat] = useState(0);
  const [linkCopied, setLinkCopied] = useState(false);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [speakerDevices, setSpeakerDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioId, setSelectedAudioId] = useState<string>("");
  const [selectedVideoId, setSelectedVideoId] = useState<string>("");
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string>("");
  const [localRenderKey, setLocalRenderKey] = useState(0);
  const [screenAudioStream, setScreenAudioStream] = useState<MediaStream | null>(null);
  const [screenResolution, setScreenResolution] = useState<string>("");
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [isMobile] = useState(isMobileDevice);

  const { startRecording, stopRecording, recordingState } = useMeetRecorder();
  const reactionCounterRef = useRef(0);

  const displayName = sessionStorage.getItem("elexico-name") || "Guest";
  
  const socket = useMemo(() => {
    console.log('[MeetingRoom] Initializing socket');
    return getSocket();
  }, []);
  
  const { captionsEnabled, captions, toggleCaptions, supported: captionsSupported, error: captionsError } = useCaptions(
    displayName,
    socket,
    roomCode || null,
    peerIdRef.current
  );
  const isHostFromStorage = sessionStorage.getItem("elexico-host") === "true";

  const rebuildLocalStream = useCallback(() => {
    const tracks: MediaStreamTrack[] = [];
    if (camTrackRef.current?.readyState === "live") tracks.push(camTrackRef.current);
    if (audioTrackRef.current?.readyState === "live") tracks.push(audioTrackRef.current);
    const stream = new MediaStream(tracks);
    localStreamRef.current = stream;
    managerRef.current?.updateLocalStream(stream);
    setLocalRenderKey((k) => k + 1);
    return stream;
  }, []);

  const closeAllPopups = () => {
    setShowReactions(false);
    setShowRecordMenu(false);
    setShowDeviceMenu(false);
    setShowBlurSlider(false);
  };

  useEffect(() => {
    console.log('[MeetingRoom] Component mounted, roomCode:', roomCode);
    setIsHost(isHostFromStorage);
    init();
    return () => {
      console.log('[MeetingRoom] Component unmounting');
      audioTrackRef.current?.stop();
      camTrackRef.current?.stop();
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      
      managerRef.current?.leave().finally(() => {
        disconnectSocket();
      });
      silentCtxRef.current?.close();
      silentCtxRef.current = null;
    };
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".popup-anchor")) closeAllPopups();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (screenVideoElRef.current && screenStreamRef.current) {
      screenVideoElRef.current.srcObject = screenStreamRef.current;
      screenVideoElRef.current.muted = true;
    }
  }, [isScreenSharing]);

  const doStopScreenShare = useCallback(() => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }
    setScreenAudioStream(null);
    setScreenResolution("");
    managerRef.current?.replaceVideoTrack((!isCameraOff && camTrackRef.current?.readyState === "live") ? camTrackRef.current : null);
    rebuildLocalStream();
    setIsScreenSharing(false);
    managerRef.current?.broadcastScreenShareState(false);
    managerRef.current?.updateParticipantStatus(isMuted, isCameraOff);
  }, [isCameraOff, isMuted, rebuildLocalStream]);

  useEffect(() => {
    document.querySelectorAll<HTMLVideoElement>("video[data-remote]").forEach((v) => {
      v.muted = isSpeakerMuted;
    });
    if (screenVideoElRef.current) {
      screenVideoElRef.current.muted = isSpeakerMuted || presentationMuted;
    }
  }, [isSpeakerMuted, presentationMuted]);

  const refreshDevices = async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const seenLabels = new Set<string>();
      const unique = all.filter((d) => {
        if (!d.label) return false;
        const normalizedLabel = d.label
          .replace(/\s*\(.*?\)\s*/g, "")
          .replace(/\bDefault\b/gi, "")
          .replace(/\bCommunications\b/gi, "")
          .trim()
          .toLowerCase();
        if (!normalizedLabel) return false;
        const k = `${d.kind}::${normalizedLabel}`;
        if (seenLabels.has(k)) return false;
        seenLabels.add(k);
        return true;
      });
      setAudioDevices(unique.filter((d) => d.kind === "audioinput"));
      setVideoDevices(unique.filter((d) => d.kind === "videoinput"));
      setSpeakerDevices(unique.filter((d) => d.kind === "audiooutput"));
    } catch {}
  };

  const showMediaError = (err: unknown, deviceLabel: string) => {
    const name = typeof err === "object" && err && "name" in err ? String((err as { name?: string }).name) : "";
    const isLocalhost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
    if (!window.isSecureContext && !isLocalhost) {
      toast.error("Camera/mic require HTTPS or localhost. Open http://localhost:8080 or use HTTPS.");
      return;
    }
    if (name == "NotAllowedError" || name == "SecurityError") {
      toast.error(`Permission denied for ${deviceLabel}. Check browser site permissions.`);
      return;
    }
    if (name == "NotFoundError") {
      toast.error(`No ${deviceLabel} device found.`);
      return;
    }
    if (name == "NotReadableError") {
      toast.error(`${deviceLabel} is already in use by another application.`);
      return;
    }
    toast.error(`Could not access ${deviceLabel}.`);
  };

  const onPeersChanged = useCallback(() => {
    if (managerRef.current) setPeers([...managerRef.current.getPeers()]);
  }, []);

  const init = async () => {
    console.log('[MeetingRoom] Init called, roomCode:', roomCode);
    if (!roomCode) {
      console.log('[MeetingRoom] No roomCode in init, returning');
      return;
    }
    try {
      console.log('[MeetingRoom] Creating AudioContext...');
      const silentCtx = new AudioContext();
      silentCtxRef.current = silentCtx;
      const silentDest = silentCtx.createMediaStreamDestination();
      audioTrackRef.current = silentDest.stream.getAudioTracks()[0];
      camTrackRef.current = null;
      console.log('[MeetingRoom] Building local stream...');
      const stream = rebuildLocalStream();
      console.log('[MeetingRoom] Creating WebRTCManager...');
      const manager = new WebRTCManager(peerIdRef.current, roomCode, displayName, isHostFromStorage, onPeersChanged);
      managerRef.current = manager;
      manager.onHostControl((fromPeer, signal) => {
        const s = signal as { _type?: string; action?: string; value?: boolean; id?: string; emoji?: string; label?: string };
        if (s._type === "reaction") {
          const reaction = (s as { reaction?: Reaction }).reaction ?? (s as Reaction);
          if (reaction?.emoji) {
            applyReaction(fromPeer, reaction);
          }
          return;
        }
        const ctrl = signal as { action: string; value: boolean };
        if (ctrl.action === "mute" || ctrl.action === "unmute") {
          setIsMuted(ctrl.value);
          if (ctrl.value) { audioTrackRef.current?.stop(); audioTrackRef.current = null; rebuildLocalStream(); }
        }
        if (ctrl.action === "lock-mic") {
          setIsMicLocked(ctrl.value);
          if (ctrl.value) { setIsMuted(true); audioTrackRef.current?.stop(); audioTrackRef.current = null; rebuildLocalStream(); }
        }
        if (ctrl.action === "unlock-mic") setIsMicLocked(false);
        if (ctrl.action === "lock-camera") {
          setIsCameraLocked(ctrl.value);
          if (ctrl.value) { setIsCameraOff(true); camTrackRef.current?.stop(); camTrackRef.current = null; rebuildLocalStream(); }
        }
        if (ctrl.action === "unlock-camera") setIsCameraLocked(false);
      });
      console.log('[MeetingRoom] Initializing manager...');
      await manager.initialize(stream);
      console.log('[MeetingRoom] Manager initialized successfully');
      setIsReady(true);
      console.log('[MeetingRoom] Set isReady to true');
      await refreshDevices();
      navigator.mediaDevices.ondevicechange = refreshDevices;
      console.log('[MeetingRoom] Init completed successfully');
    } catch (err) {
      console.error("[MeetingRoom] Initialization error:", err);
      showMediaError(err, "camera and microphone");
      // Set ready to true anyway so the user can see the meeting room
      // They can try to enable camera/mic manually later
      setIsReady(true);
      console.log('[MeetingRoom] Set isReady to true despite error');
    }
  };

  const toggleMic = async () => {
    if (isMicLocked) return;
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    if (newMuted) {
      const track = audioTrackRef.current;
      audioTrackRef.current = null;
      track?.stop();
      rebuildLocalStream();
      await managerRef.current?.replaceAudioTrack(null);
    } else {
      try {
        const constraints: MediaStreamConstraints = {
          audio: selectedAudioId
            ? { deviceId: { exact: selectedAudioId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
            : { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        };
        const ns = await navigator.mediaDevices.getUserMedia(constraints);
        const newTrack = ns.getAudioTracks()[0];
        if (!newTrack) { setIsMuted(true); return; }
        audioTrackRef.current = newTrack;
        rebuildLocalStream();
        await managerRef.current?.replaceAudioTrack(newTrack);
      } catch (err) {
        console.error("toggleMic getUserMedia error:", err);
        showMediaError(err, "microphone");
        setIsMuted(true);
      }
    }
    managerRef.current?.updateParticipantStatus(newMuted, isCameraOff);
  };

  const toggleCamera = async () => {
    if (isCameraLocked) return;
    const newOff = !isCameraOff;
    setIsCameraOff(newOff);
    if (newOff) {
      camTrackRef.current?.stop();
      camTrackRef.current = null;
      if (!isScreenSharing) {
        rebuildLocalStream();
        managerRef.current?.replaceVideoTrack(null);
        managerRef.current?.updateParticipantStatus(isMuted, true);
      } else {
        setLocalRenderKey((k) => k + 1);
      }
    } else {
      try {
        const constraints: MediaStreamConstraints = {
          video: selectedVideoId
            ? { deviceId: { exact: selectedVideoId }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }
            : isMobile
              ? { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }
              : { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
        };
        const ns = await navigator.mediaDevices.getUserMedia(constraints);
        camTrackRef.current = ns.getVideoTracks()[0];
        if (!isScreenSharing) {
          rebuildLocalStream();
          await managerRef.current?.replaceVideoTrack(camTrackRef.current);
          managerRef.current?.updateParticipantStatus(isMuted, false);
        } else {
          setLocalRenderKey((k) => k + 1);
        }
      } catch (err) {
        showMediaError(err, "camera");
        setIsCameraOff(true);
      }
    }
  };

  const flipCamera = async () => {
    if (!isMobile || isCameraOff) return;
    const newFacing = facingMode === "user" ? "environment" : "user";
    setFacingMode(newFacing);
    try {
      const ns = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: newFacing, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      camTrackRef.current?.stop();
      camTrackRef.current = ns.getVideoTracks()[0];
      if (!isScreenSharing) {
        rebuildLocalStream();
        managerRef.current?.replaceVideoTrack(camTrackRef.current);
      } else {
        setLocalRenderKey((k) => k + 1);
      }
    } catch {}
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) { doStopScreenShare(); return; }
    if (isMobile) {
      try {
        const screen = await (navigator.mediaDevices as MediaDevices & {
          getDisplayMedia: (constraints?: MediaStreamConstraints) => Promise<MediaStream>;
        }).getDisplayMedia({ video: true });
        screenStreamRef.current = screen;
        managerRef.current?.replaceVideoTrack(screen.getVideoTracks()[0]);
        setScreenAudioStream(null);
        setScreenResolution("");
        setIsScreenSharing(true);
        managerRef.current?.broadcastScreenShareState(true);
        screen.getVideoTracks()[0].onended = () => doStopScreenShare();
      } catch {}
      return;
    }
    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
        audio: { echoCancellation: false, noiseSuppression: false, sampleRate: 44100 } as MediaTrackConstraints,
      });
      screenStreamRef.current = screen;
      managerRef.current?.replaceVideoTrack(screen.getVideoTracks()[0]);
      const audioTracks = screen.getAudioTracks();
      if (audioTracks.length > 0) {
        const screenAudioOnly = new MediaStream(audioTracks);
        setScreenAudioStream(screenAudioOnly);
        if (screenVideoElRef.current) {
          screenVideoElRef.current.muted = true;
        }
      } else {
        setScreenAudioStream(null);
      }
      const vTrack = screen.getVideoTracks()[0];
      if (vTrack) {
        const s = vTrack.getSettings();
        const w = s.width || 0;
        const label = w >= 3840 ? "4K" : w >= 2560 ? "1440p" : w >= 1920 ? "1080p" : w >= 1280 ? "720p" : w >= 854 ? "480p" : `${w}×${s.height || 0}`;
        setScreenResolution(label);
      }
      setIsScreenSharing(true);
      managerRef.current?.broadcastScreenShareState(true);
      screen.getVideoTracks()[0].onended = () => doStopScreenShare();
    } catch {}
  };

  const togglePresentationMute = () => {
    const newMuted = !presentationMuted;
    setPresentationMuted(newMuted);
    if (screenVideoElRef.current) screenVideoElRef.current.muted = newMuted || isSpeakerMuted;
  };

  const switchDevice = async (kind: "audio" | "video" | "speaker", deviceId: string) => {
    if (kind === "speaker") {
      setSelectedSpeakerId(deviceId);
      document.querySelectorAll<HTMLVideoElement & { setSinkId?: (id: string) => Promise<void> }>("video[data-remote]").forEach(async (v) => {
        if (v.setSinkId) await v.setSinkId(deviceId);
      });
    } else if (kind === "audio") {
      setSelectedAudioId(deviceId);
      if (!isMuted) {
        try {
          const ns = await navigator.mediaDevices.getUserMedia({
            audio: { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          });
          const newTrack = ns.getAudioTracks()[0];
          if (newTrack) {
            audioTrackRef.current?.stop();
            audioTrackRef.current = newTrack;
            rebuildLocalStream();
            await managerRef.current?.replaceAudioTrack(newTrack);
          }
        } catch {}
      }
    } else {
      setSelectedVideoId(deviceId);
      if (!isCameraOff && !isScreenSharing) {
        try {
          const ns = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } } });
          camTrackRef.current?.stop();
          camTrackRef.current = ns.getVideoTracks()[0];
          const s = rebuildLocalStream();
          managerRef.current?.replaceVideoTrack(s.getVideoTracks()[0]);
        } catch {}
      } else if (!isCameraOff && isScreenSharing) {
        try {
          const ns = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId }, width: 320, height: 240 } });
          camTrackRef.current?.stop();
          camTrackRef.current = ns.getVideoTracks()[0];
          setLocalRenderKey((k) => k + 1);
        } catch {}
      }
    }
    setShowDeviceMenu(false);
  };

  const toggleSpeaker = () => {
    const newMuted = !isSpeakerMuted;
    setIsSpeakerMuted(newMuted);
    document.querySelectorAll<HTMLVideoElement>("video[data-remote]").forEach((v) => { v.muted = newMuted; });
    if (screenVideoElRef.current) screenVideoElRef.current.muted = newMuted || presentationMuted;
  };

  const spawnParticles = useCallback((emoji: string) => {
    const count = 3 + Math.floor(Math.random() * 2);
    const newParticles: EmojiParticle[] = Array.from({ length: count }, (_, i) => {
      particleCounterRef.current += 1;
      return {
        id: particleCounterRef.current,
        emoji,
        x: 45 + Math.random() * 10,
        delay: i * 100,
        size: 40,
        drift: (Math.random() - 0.5) * 10,
      };
    });
    setEmojiParticles((prev) => [...prev, ...newParticles]);
    setTimeout(() => {
      const ids = new Set(newParticles.map((p) => p.id));
      setEmojiParticles((prev) => prev.filter((p) => !ids.has(p.id)));
    }, 4500);
  }, []);

  const applyReaction = useCallback((peerId: string, reaction: Reaction) => {
    reactionCounterRef.current += 1;
    const instanceId = reactionCounterRef.current;
    const offsetX = (Math.random() - 0.5) * 40;
    setReactions((prev) => [...prev, { ...reaction, peerId, instanceId, offsetX }]);
    spawnParticles(reaction.emoji);
    setTimeout(() => {
      setReactions((prev) => prev.filter((r) => r.instanceId !== instanceId));
    }, 3200);
  }, [spawnParticles]);

  const getLatestReaction = useCallback((peerId: string) => {
    for (let i = reactions.length - 1; i >= 0; i -= 1) {
      if (reactions[i].peerId === peerId) return reactions[i];
    }
    return undefined;
  }, [reactions]);

  const handleReaction = (r: Reaction) => {
    applyReaction(peerIdRef.current, r);
    managerRef.current?.sendSignal("reaction", { reaction: r });
  };

  const handleStartRecord = async (mode: RecordingMode) => {
    setShowRecordMenu(false);
    const remoteStreams = peers.map((p) => p.stream).filter(Boolean) as MediaStream[];
    const container = meetingRoomRef.current ?? undefined;
    if (localStreamRef.current) await startRecording(localStreamRef.current, remoteStreams, mode, screenStreamRef.current ?? undefined, container);
  };

  const copyInviteLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/meeting/${roomCode}`);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const toggleSidePanel = (panel: SidePanel) => {
    setSidePanel((prev) => (prev === panel ? null : panel));
    if (panel === "chat") setUnreadChat(0);
  };

  const [showLeaveModal, setShowLeaveModal] = useState(false);

  const leave = async () => {
    if (recordingState === "recording") stopRecording();
    if (captionsEnabled) toggleCaptions();
    audioTrackRef.current?.stop();
    camTrackRef.current?.stop();
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    await managerRef.current?.leave();
    disconnectSocket();
    navigate("/");
  };

  // "Leave Meeting" — disconnect call, session (name) is preserved for rejoin
  const handleLeaveMeeting = async () => {
    setShowLeaveModal(false);
    await leave();
  };

  // "Leave Room" — full exit, clear session so home page shows fresh
  const handleLeaveRoom = async () => {
    setShowLeaveModal(false);
    sessionStorage.removeItem("elexico-name");
    sessionStorage.removeItem("elexico-host");
    await leave();
  };

  const camStreamForSideTileRef = useRef<MediaStream | null>(null);
  if (!isCameraOff && camTrackRef.current?.readyState === "live") {
    if (!camStreamForSideTileRef.current || !camStreamForSideTileRef.current.getTracks().includes(camTrackRef.current)) {
      camStreamForSideTileRef.current = new MediaStream([camTrackRef.current]);
    }
  } else {
    camStreamForSideTileRef.current = null;
  }

  const localTileStream = isScreenSharing ? camStreamForSideTileRef.current : localStreamRef.current;
  const localTileOff = isScreenSharing
    ? (!camTrackRef.current || camTrackRef.current.readyState !== "live" || isCameraOff)
    : isCameraOff;

  const allTiles = [
    {
      key: `local-${localRenderKey}`,
      stream: localTileStream,
      displayName, isMuted, isCameraOff: localTileOff,
      isMicLocked, isCameraLocked, isLocal: true, isHost,
      peerId: peerIdRef.current, signalQuality: undefined as undefined,
    },
    ...peers.map((p) => ({
      key: p.peerId, stream: p.stream, displayName: p.displayName,
      isMuted: p.isMuted, isCameraOff: p.isCameraOff,
      isMicLocked: p.isMicLocked, isCameraLocked: p.isCameraLocked,
      isLocal: false, isHost: p.isHost, peerId: p.peerId, signalQuality: p.signalQuality,
    })),
  ];

  const remoteSharingPeer = peers.find((p) => p.isScreenSharing);
  const showRemoteScreenShare = !isScreenSharing && !!remoteSharingPeer;

  const count = allTiles.length;
  const gridCols = count === 1 ? "grid-cols-1" : count === 2 ? "grid-cols-2" : count <= 4 ? "grid-cols-2" : count <= 6 ? "grid-cols-3" : "grid-cols-4";

  console.log('[MeetingRoom] Rendering - isReady:', isReady, 'roomCode:', roomCode, 'peers:', peers.length);

  if (!roomCode) {
    console.log('[MeetingRoom] No roomCode, showing loading...');
    return <LoadingScreen />;
  }

  if (!isReady) {
    console.log('[MeetingRoom] Not ready yet, showing loading...');
    return <LoadingScreen />;
  }

  console.log('[MeetingRoom] Rendering meeting room');

  return (
    <div ref={meetingRoomRef} className="meet-room flex flex-col h-screen overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 meet-surface border-b border-meet-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md flex items-center justify-center font-black text-xs text-white" style={{ background: "linear-gradient(135deg,#16a34a,#15803d)" }}>E</div>
            <span className="text-meet-text font-semibold text-sm tracking-wide hidden sm:block">ELEXICO MEET</span>
          </div>
          <span className="text-meet-text-muted text-xs hidden sm:block">·</span>
          <span className="text-meet-text-muted text-xs hidden sm:block font-mono">{roomCode}</span>
          {recordingState === "recording" && (
            <div className="flex items-center gap-1.5 bg-meet-red/20 border border-meet-red/40 rounded-full px-2.5 py-0.5">
              <span className="rec-dot" />
              <span className="text-xs text-meet-red font-semibold tracking-wide">REC</span>
            </div>
          )}
          {isScreenSharing && (
            <div className="flex items-center gap-1.5 bg-green-500/20 border border-green-500/40 rounded-full px-2.5 py-0.5">
              <ScreenShareIcon className="w-3 h-3 text-green-400" />
              <span className="text-xs text-green-400 font-medium hidden sm:block">Presenting</span>
            </div>
          )}
          {captionsEnabled && (
            <div className="flex items-center gap-1.5 bg-meet-blue/20 border border-meet-blue/40 rounded-full px-2.5 py-0.5">
              <Captions className="w-3 h-3 text-meet-blue" />
              <span className="text-xs text-meet-blue font-medium hidden sm:block">CC</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Tooltip text={linkCopied ? "Copied!" : "Copy invite link"}>
            <button onClick={copyInviteLink} className="flex items-center gap-1.5 text-xs text-meet-text-muted hover:text-meet-text transition-colors">
              {linkCopied ? <Check className="w-3.5 h-3.5 text-meet-green" /> : <Link2 className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{linkCopied ? "Copied" : "Invite"}</span>
            </button>
          </Tooltip>
          <div className="flex items-center gap-1.5 text-xs text-meet-text-muted">
            <span className="w-2 h-2 rounded-full bg-meet-green" />
            <span>{allTiles.length} participant{allTiles.length !== 1 ? "s" : ""}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          {isScreenSharing ? (
            <div className="flex-1 flex overflow-hidden p-2 gap-2 min-h-0">
              <div className="flex-1 flex flex-col gap-2 min-w-0 min-h-0">
                <div className="flex-1 relative rounded-xl overflow-hidden bg-black min-h-0">
                  <video ref={screenVideoElRef} autoPlay muted playsInline className="w-full h-full object-contain" />
                </div>
                {!isMobile && (
                  <div className="flex-shrink-0 flex items-center gap-3 bg-meet-surface rounded-xl px-4 py-2.5 border border-meet-border">
                    <div className="flex flex-col gap-0.5 flex-shrink-0 min-w-[52px]">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-green-400 tracking-wide">LIVE</span>
                        {screenResolution && <span className="text-[10px] font-bold text-green-400 tracking-wide">{screenResolution}</span>}
                      </div>
                      <span className="text-[10px] text-meet-text-muted font-medium">Tab audio</span>
                    </div>
                    {screenAudioStream ? (
                      <DualVUMeter stream={presentationMuted || isSpeakerMuted ? null : screenAudioStream} isMuted={presentationMuted || isSpeakerMuted} />
                    ) : (
                      <div className="flex-1 flex items-center">
                        <span className="text-[11px] text-meet-text-muted italic">No tab audio captured</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={togglePresentationMute}
                        className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${presentationMuted || isSpeakerMuted ? "bg-meet-red/20 border-meet-red/40 text-meet-red" : "bg-meet-surface-2 border-meet-border text-meet-text-muted hover:text-meet-text"}`}
                        disabled={isSpeakerMuted}
                      >
                        {presentationMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                        <span>{presentationMuted ? "Unmute tab" : "Mute tab"}</span>
                      </button>
                      <button
                        onClick={toggleMic}
                        className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${isMuted ? "bg-meet-red/20 border-meet-red/40 text-meet-red" : "bg-meet-surface-2 border-meet-border text-meet-text-muted hover:text-meet-text"}`}
                        disabled={isMicLocked}
                      >
                        {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                        <span>{isMuted ? "Unmute mic" : "Mute mic"}</span>
                      </button>
                      {recordingState === "recording" && (
                        <div className="flex items-center gap-1.5 bg-meet-red/20 border border-meet-red/40 rounded-lg px-3 py-1.5">
                          <span className="rec-dot" />
                          <span className="text-xs text-meet-red font-semibold tracking-wide">REC</span>
                        </div>
                      )}
                      <button
                        onClick={doStopScreenShare}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-meet-red/50 bg-meet-red/10 text-meet-red hover:bg-meet-red/20 transition-colors"
                      >
                        <ScreenShareIcon className="w-3.5 h-3.5" />
                        <span>Stop sharing</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="w-28 sm:w-36 flex-shrink-0 flex flex-col gap-2 overflow-y-auto">
                {allTiles.map((tile) => (
                  <div key={tile.key} className="w-full aspect-video rounded-xl overflow-hidden flex-shrink-0 relative">
                    <VideoTile
                      stream={tile.stream} displayName={tile.displayName}
                      isMuted={tile.isMuted} isCameraOff={tile.isCameraOff}
                      isMicLocked={tile.isMicLocked} isCameraLocked={tile.isCameraLocked}
                      isLocal={tile.isLocal} isHost={tile.isHost}
                      isSpeakerMuted={!tile.isLocal && isSpeakerMuted}
                      blurIntensity={0} signalQuality={tile.signalQuality}
                      reaction={getLatestReaction(tile.peerId)}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : showRemoteScreenShare ? (
            <div className="flex-1 flex flex-row overflow-hidden p-2 gap-2 min-h-0">
              <div className="flex-1 flex flex-col gap-2 min-w-0 min-h-0 overflow-hidden">
                <div className="flex-1 relative rounded-xl overflow-hidden bg-black min-h-0">
                  <RemoteScreenVideo
                    stream={remoteSharingPeer!.stream}
                    isSpeakerMuted={isSpeakerMuted}
                  />
                  <div className="absolute top-3 left-3 flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 bg-black/60 rounded-full px-2.5 py-1">
                      <ScreenShareIcon className="w-3 h-3 text-green-400" />
                      <span className="text-xs text-green-400 font-medium">{remoteSharingPeer?.displayName} is presenting</span>
                    </div>
                    {remoteSharingPeer?.isHost && (
                      <div className="flex items-center gap-1 bg-black/60 rounded-full px-2.5 py-0.5 w-fit">
                        <span className="text-[10px] font-semibold text-meet-yellow">Host</span>
                      </div>
                    )}
                  </div>
                </div>
                {!isMobile && (
                  <div className="flex-shrink-0 flex items-center gap-3 bg-meet-surface rounded-xl px-4 py-2.5 border border-meet-border">
                    <div className="flex flex-col gap-0.5 flex-shrink-0 min-w-[52px]">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-green-400 tracking-wide">LIVE</span>
                      </div>
                      <span className="text-[10px] text-meet-text-muted font-medium">Tab audio</span>
                    </div>
                    <DualVUMeter stream={isSpeakerMuted ? null : remoteSharingPeer!.stream} isMuted={isSpeakerMuted} />
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={toggleSpeaker}
                        className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${isSpeakerMuted ? "bg-meet-red/20 border-meet-red/40 text-meet-red" : "bg-meet-surface-2 border-meet-border text-meet-text-muted hover:text-meet-text"}`}
                      >
                        {isSpeakerMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                        <span>{isSpeakerMuted ? "Unmute" : "Mute audio"}</span>
                      </button>
                      <button
                        onClick={toggleMic}
                        className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${isMuted ? "bg-meet-red/20 border-meet-red/40 text-meet-red" : "bg-meet-surface-2 border-meet-border text-meet-text-muted hover:text-meet-text"}`}
                        disabled={isMicLocked}
                      >
                        {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                        <span>{isMuted ? "Unmute mic" : "Mute mic"}</span>
                      </button>
                      {recordingState === "recording" && (
                        <div className="flex items-center gap-1.5 bg-meet-red/20 border border-meet-red/40 rounded-lg px-3 py-1.5">
                          <span className="rec-dot" />
                          <span className="text-xs text-meet-red font-semibold tracking-wide">REC</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div className="w-28 sm:w-36 flex-shrink-0 flex flex-col gap-2 overflow-y-auto">
                {allTiles.map((tile) => (
                  <div key={tile.key} className="w-full aspect-video rounded-xl overflow-hidden flex-shrink-0 relative">
                    <VideoTile
                      stream={tile.stream}
                      displayName={tile.displayName}
                      isMuted={tile.isMuted}
                      isCameraOff={tile.peerId === remoteSharingPeer?.peerId ? true : tile.isCameraOff}
                      isMicLocked={tile.isMicLocked} isCameraLocked={tile.isCameraLocked}
                      isLocal={tile.isLocal} isHost={tile.isHost}
                      isSpeakerMuted={!tile.isLocal && isSpeakerMuted}
                      blurIntensity={tile.isLocal ? blurIntensity : 0}
                      signalQuality={tile.signalQuality}
                      reaction={getLatestReaction(tile.peerId)}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className={`flex-1 grid ${gridCols} gap-2 p-2 sm:p-3 overflow-hidden`}>
              {allTiles.map((tile) => (
                <div key={tile.key} className={`relative rounded-xl overflow-hidden ${count === 1 ? "min-h-[200px] sm:min-h-[400px]" : ""}`}>
                  <VideoTile
                    stream={tile.stream} displayName={tile.displayName}
                    isMuted={tile.isMuted} isCameraOff={tile.isCameraOff}
                    isMicLocked={tile.isMicLocked} isCameraLocked={tile.isCameraLocked}
                    isLocal={tile.isLocal} isHost={tile.isHost}
                    isSpeakerMuted={!tile.isLocal && isSpeakerMuted}
                    blurIntensity={tile.isLocal ? blurIntensity : 0}
                    signalQuality={tile.signalQuality}
                    reaction={getLatestReaction(tile.peerId)}
                  />
                </div>
              ))}
            </div>
          )}

          {captionsEnabled && (
            <div className="flex-shrink-0 px-4 py-4 pointer-events-none select-none" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.7) 50%, transparent 100%)", position: "relative", minHeight: "100px" }}>
              <div className="flex flex-col gap-2.5 items-center max-w-5xl mx-auto">
                {captions.length > 0 ? (
                  captions.map((line) => (
                    <div 
                      key={line.id} 
                      className={`flex flex-col w-full max-w-4xl backdrop-blur-sm rounded-lg px-4 py-2.5 shadow-lg border ${
                        line.isLocal 
                          ? 'bg-blue-900/60 border-blue-500/30' 
                          : 'bg-black/60 border-white/10'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <span className={`text-xs font-bold flex-shrink-0 uppercase tracking-wide ${
                          line.isLocal ? 'text-blue-300' : 'text-green-400'
                        }`}>
                          {line.speaker} {line.isLocal && '(You)'}
                        </span>
                        <div className="flex-1 min-w-0">
                          {line.text && (
                            <p className="text-base text-white leading-relaxed font-medium">
                              {line.text}
                            </p>
                          )}
                          {line.interim && (
                            <p className="text-sm text-white/60 italic leading-relaxed mt-0.5">
                              {line.interim}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex items-center gap-2.5 bg-black/50 backdrop-blur-sm px-4 py-2.5 rounded-lg border border-green-500/30">
                    <span className="inline-block w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse shadow-lg shadow-green-500/50"></span>
                    <span className="text-white/80 text-sm font-medium">Captions active - Start speaking to see live transcription</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {captionsError && (
            <div className="flex-shrink-0 px-4 py-1.5 flex items-center justify-center gap-2 bg-meet-red/20 border-t border-meet-red/30">
              <CaptionsOff className="w-3.5 h-3.5 text-meet-red flex-shrink-0" />
              <span className="text-xs text-meet-red">{captionsError}</span>
            </div>
          )}

          {isMobile ? (
            <div className="flex-shrink-0 meet-surface border-t border-meet-border">
              <div className="flex items-center justify-around px-2 py-3">
                <button onClick={toggleMic} className={`meet-btn-mobile ${isMuted ? "active" : ""} ${isMicLocked ? "opacity-40" : ""}`}>
                  {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
                <button onClick={toggleCamera} className={`meet-btn-mobile ${isCameraOff ? "active" : ""} ${isCameraLocked ? "opacity-40" : ""}`}>
                  {isCameraOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
                </button>
                {isMobile && !isCameraOff && (
                  <button onClick={flipCamera} className="meet-btn-mobile">
                    <FlipHorizontal className="w-5 h-5" />
                  </button>
                )}
                <button onClick={toggleSpeaker} className={`meet-btn-mobile ${isSpeakerMuted ? "active" : ""}`}>
                  {isSpeakerMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>
                <button onClick={() => toggleSidePanel("chat")} className={`meet-btn-mobile relative ${sidePanel === "chat" ? "active-green" : ""}`}>
                  <MessageSquare className="w-5 h-5" />
                  {unreadChat > 0 && <span className="absolute -top-1 -right-1 bg-meet-blue text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">{unreadChat}</span>}
                </button>
                <button onClick={() => setShowLeaveModal(true)} className="w-12 h-12 rounded-full bg-meet-red flex items-center justify-center">
                  <PhoneOff className="w-5 h-5 text-white" />
                </button>
              </div>
              <div className="flex items-center justify-around px-2 pb-3">
                <button onClick={toggleScreenShare} className={`meet-btn-mobile ${isScreenSharing ? "active-green" : ""}`}>
                  <ScreenShareIcon className="w-5 h-5" />
                </button>
                <div className="relative popup-anchor">
                  <button onClick={() => { setShowBlurSlider((s) => !s); setShowReactions(false); setShowRecordMenu(false); setShowDeviceMenu(false); }} className={`meet-btn-mobile ${blurIntensity > 0 ? "active-green" : ""}`}>
                    <ScanFace className="w-5 h-5" />
                  </button>
                  {showBlurSlider && (
                    <div className="absolute bottom-14 left-1/2 -translate-x-1/2 glass-panel rounded-xl px-4 py-3 shadow-2xl z-50 border border-meet-border w-52">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-meet-text font-medium">Background Blur</p>
                        <button onClick={() => { setBlurIntensity(0); setShowBlurSlider(false); }} className="text-meet-text-muted hover:text-meet-text text-xs">Off</button>
                      </div>
                      <input type="range" min={0} max={100} step={5} value={blurIntensity} onChange={(e) => setBlurIntensity(Number(e.target.value))} className="w-full accent-green-500" />
                      <div className="flex justify-between text-[10px] text-meet-text-muted mt-1">
                        <span>0%</span><span className="text-green-400 font-medium">{blurIntensity}%</span><span>100%</span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="relative popup-anchor">
                  <button onClick={() => { setShowRecordMenu(false); setShowDeviceMenu(false); setShowBlurSlider(false); setShowReactions((s) => !s); }} className={`meet-btn-mobile ${showReactions ? "active-green" : ""}`}>
                    <Smile className="w-5 h-5" />
                  </button>
                  {showReactions && (
                    <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-50 popup-anchor" onMouseDown={(e) => e.stopPropagation()}>
                      <ReactionsPanel onReact={handleReaction} onClose={() => setShowReactions(false)} />
                    </div>
                  )}
                </div>
                <button onClick={() => toggleSidePanel("participants")} className={`meet-btn-mobile ${sidePanel === "participants" ? "active-green" : ""}`}>
                  <Users className="w-5 h-5" />
                </button>
                <Tooltip text={captionsEnabled ? "Turn off live captions" : captionsSupported ? "Turn on live captions (speech to text)" : "Live captions not supported in this browser"}>
                  <button onClick={toggleCaptions} className={`meet-btn-mobile ${captionsEnabled ? "active-green" : ""} ${!captionsSupported ? "opacity-40 cursor-not-allowed" : ""}`}>
                    {captionsEnabled ? <CaptionsOff className="w-5 h-5" /> : <Captions className="w-5 h-5" />}
                  </button>
                </Tooltip>
                <div className="relative popup-anchor">
                  <button onClick={() => { setShowReactions(false); setShowRecordMenu(false); setShowBlurSlider(false); setShowDeviceMenu((s) => !s); }} className={`meet-btn-mobile ${showDeviceMenu ? "active-green" : ""}`}>
                    <Settings className="w-5 h-5" />
                  </button>
                  {showDeviceMenu && (
                    <div className="absolute bottom-14 right-0 rounded-xl p-3 w-64 shadow-2xl z-50 border border-meet-border" style={{ background: "hsl(220 20% 10%)" }}>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs text-meet-text font-semibold uppercase tracking-wide">Devices</p>
                        <button onClick={() => setShowDeviceMenu(false)} className="text-meet-text-muted hover:text-meet-text"><X className="w-3.5 h-3.5" /></button>
                      </div>
                      <p className="text-xs text-meet-text-muted font-medium uppercase tracking-wide mb-2">Microphone</p>
                      {audioDevices.map((d) => (
                        <button key={d.deviceId} onClick={() => switchDevice("audio", d.deviceId)} className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-colors flex items-center gap-2 ${selectedAudioId === d.deviceId || (!selectedAudioId && d.deviceId === "default") ? "bg-meet-blue/20 text-meet-blue" : "text-meet-text hover:bg-meet-surface-2"}`}>
                          <Mic className="w-3 h-3 flex-shrink-0" /><span className="truncate">{d.label || "Microphone"}</span>
                        </button>
                      ))}
                      <p className="text-xs text-meet-text-muted font-medium uppercase tracking-wide mt-3 mb-2">Camera</p>
                      {videoDevices.map((d) => (
                        <button key={d.deviceId} onClick={() => switchDevice("video", d.deviceId)} className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-colors flex items-center gap-2 ${selectedVideoId === d.deviceId ? "bg-meet-blue/20 text-meet-blue" : "text-meet-text hover:bg-meet-surface-2"}`}>
                          <Video className="w-3 h-3 flex-shrink-0" /><span className="truncate">{d.label || "Camera"}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-shrink-0 flex items-center justify-center gap-2 py-3 meet-surface border-t border-meet-border px-4 flex-wrap">
              <Tooltip text={isMicLocked ? "Mic locked by host" : isMuted ? "Unmute mic" : "Mute mic"}>
                <button onClick={toggleMic} className={`meet-btn ${isMuted ? "active" : ""} ${isMicLocked ? "opacity-40 cursor-not-allowed" : ""}`}>
                  {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
              </Tooltip>

              <Tooltip text={isCameraLocked ? "Camera locked by host" : isCameraOff ? "Turn on camera" : "Turn off camera"}>
                <button onClick={toggleCamera} className={`meet-btn ${isCameraOff ? "active" : ""} ${isCameraLocked ? "opacity-40 cursor-not-allowed" : ""}`}>
                  {isCameraOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
                </button>
              </Tooltip>

              <Tooltip text={isSpeakerMuted ? "Unmute speaker" : "Mute speaker"}>
                <button onClick={toggleSpeaker} className={`meet-btn ${isSpeakerMuted ? "active" : ""}`}>
                  {isSpeakerMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>
              </Tooltip>

              <Tooltip text={isScreenSharing ? "Stop sharing screen" : "Share screen"}>
                <button onClick={toggleScreenShare} className={`meet-btn ${isScreenSharing ? "active-green" : ""}`}>
                  <ScreenShareIcon className="w-5 h-5" />
                </button>
              </Tooltip>

              <div className="relative popup-anchor">
                <Tooltip text={blurIntensity > 0 ? `Blur: ${blurIntensity}%` : "Background blur"}>
                  <button onClick={() => { setShowBlurSlider((s) => !s); setShowReactions(false); setShowRecordMenu(false); setShowDeviceMenu(false); }} className={`meet-btn ${blurIntensity > 0 ? "active-green" : ""}`}>
                    <ScanFace className="w-5 h-5" />
                  </button>
                </Tooltip>
                {showBlurSlider && (
                  <div className="absolute bottom-14 left-1/2 -translate-x-1/2 glass-panel rounded-xl px-4 py-3 shadow-2xl z-50 border border-meet-border w-52">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-meet-text font-medium">Background Blur</p>
                      <button onClick={() => { setBlurIntensity(0); setShowBlurSlider(false); }} className="text-meet-text-muted hover:text-meet-text text-xs">Off</button>
                    </div>
                    <input type="range" min={0} max={100} step={5} value={blurIntensity} onChange={(e) => setBlurIntensity(Number(e.target.value))} className="w-full accent-green-500" />
                    <div className="flex justify-between text-[10px] text-meet-text-muted mt-1">
                      <span>0%</span><span className="text-green-400 font-medium">{blurIntensity}%</span><span>100%</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="relative popup-anchor">
                <Tooltip text={recordingState === "recording" ? "Stop recording" : "Start recording"}>
                  <button
                    onClick={() => { if (recordingState === "recording") { stopRecording(); } else { setShowReactions(false); setShowDeviceMenu(false); setShowBlurSlider(false); setShowRecordMenu((s) => !s); } }}
                    className={`meet-btn ${recordingState === "recording" ? "rec-btn-active" : ""}`}
                  >
                    {recordingState === "recording" ? <StopCircle className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                  </button>
                </Tooltip>
                {showRecordMenu && recordingState !== "recording" && (
                  <div className="absolute bottom-14 left-1/2 -translate-x-1/2 glass-panel rounded-xl p-2 w-52 shadow-2xl z-50 border border-meet-border">
                    <div className="flex items-center justify-between px-2 py-1 mb-1">
                      <p className="text-xs text-meet-text-muted font-medium uppercase tracking-wide">Record as</p>
                      <button onClick={() => setShowRecordMenu(false)} className="text-meet-text-muted hover:text-meet-text"><X className="w-3.5 h-3.5" /></button>
                    </div>
                    {(["participants", "fullscreen", "presenter"] as RecordingMode[]).map((m) => (
                      <button key={m} onClick={() => handleStartRecord(m)} className="w-full text-left px-3 py-2 text-sm text-meet-text rounded-lg hover:bg-meet-surface-2 transition-colors">
                        {m === "participants" && "Participants view"}
                        {m === "fullscreen" && "Full screen capture"}
                        {m === "presenter" && "Presenter screen"}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="relative popup-anchor">
                <Tooltip text="Reactions">
                  <button onClick={() => { setShowRecordMenu(false); setShowDeviceMenu(false); setShowBlurSlider(false); setShowReactions((s) => !s); }} className={`meet-btn ${showReactions ? "active-green" : ""}`}>
                    <Smile className="w-5 h-5" />
                  </button>
                </Tooltip>
                {showReactions && (
                  <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-50 popup-anchor" onMouseDown={(e) => e.stopPropagation()}>
                    <ReactionsPanel onReact={handleReaction} onClose={() => setShowReactions(false)} />
                  </div>
                )}
              </div>

              <Tooltip text="Chat">
                <button onClick={() => toggleSidePanel("chat")} className={`meet-btn relative ${sidePanel === "chat" ? "active-green" : ""}`}>
                  <MessageSquare className="w-5 h-5" />
                  {unreadChat > 0 && <span className="absolute -top-1 -right-1 bg-meet-blue text-meet-text text-xs rounded-full w-4 h-4 flex items-center justify-center">{unreadChat}</span>}
                </button>
              </Tooltip>

              <Tooltip text="Participants">
                <button onClick={() => toggleSidePanel("participants")} className={`meet-btn ${sidePanel === "participants" ? "active-green" : ""}`}>
                  <Users className="w-5 h-5" />
                </button>
              </Tooltip>

              <div className="relative popup-anchor">
                <Tooltip text="Devices">
                  <button onClick={() => { setShowReactions(false); setShowRecordMenu(false); setShowBlurSlider(false); setShowDeviceMenu((s) => !s); }} className={`meet-btn ${showDeviceMenu ? "active-green" : ""}`}>
                    <Settings className="w-5 h-5" />
                  </button>
                </Tooltip>
                {showDeviceMenu && (
                  <div className="absolute bottom-14 right-0 rounded-xl p-3 w-64 shadow-2xl z-50 border border-meet-border" style={{ background: "hsl(220 20% 10%)" }}>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs text-meet-text font-semibold uppercase tracking-wide">Devices</p>
                      <button onClick={() => setShowDeviceMenu(false)} className="text-meet-text-muted hover:text-meet-text"><X className="w-3.5 h-3.5" /></button>
                    </div>
                    <p className="text-xs text-meet-text-muted font-medium uppercase tracking-wide mb-2">Microphone</p>
                    {audioDevices.length === 0 && <p className="text-xs text-meet-text-muted px-3 py-1">No microphone found</p>}
                    {audioDevices.map((d) => (
                      <button key={d.deviceId} onClick={() => switchDevice("audio", d.deviceId)} className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-colors flex items-center gap-2 ${selectedAudioId === d.deviceId || (!selectedAudioId && d.deviceId === "default") ? "bg-meet-blue/20 text-meet-blue" : "text-meet-text hover:bg-meet-surface-2"}`}>
                        <Mic className="w-3 h-3 flex-shrink-0" /><span className="truncate">{d.label || "Microphone"}</span>
                      </button>
                    ))}
                    <p className="text-xs text-meet-text-muted font-medium uppercase tracking-wide mt-3 mb-2">Camera</p>
                    {videoDevices.length === 0 && <p className="text-xs text-meet-text-muted px-3 py-1">No camera found</p>}
                    {videoDevices.map((d) => (
                      <button key={d.deviceId} onClick={() => switchDevice("video", d.deviceId)} className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-colors flex items-center gap-2 ${selectedVideoId === d.deviceId || (!selectedVideoId && d.deviceId === "default") ? "bg-meet-blue/20 text-meet-blue" : "text-meet-text hover:bg-meet-surface-2"}`}>
                        <Video className="w-3 h-3 flex-shrink-0" /><span className="truncate">{d.label || "Camera"}</span>
                      </button>
                    ))}
                    {speakerDevices.length > 0 && (
                      <>
                        <p className="text-xs text-meet-text-muted font-medium uppercase tracking-wide mt-3 mb-2">Speaker</p>
                        {speakerDevices.map((d) => (
                          <button key={d.deviceId} onClick={() => switchDevice("speaker", d.deviceId)} className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-colors flex items-center gap-2 ${selectedSpeakerId === d.deviceId || (!selectedSpeakerId && d.deviceId === "default") ? "bg-meet-blue/20 text-meet-blue" : "text-meet-text hover:bg-meet-surface-2"}`}>
                            <Volume2 className="w-3 h-3 flex-shrink-0" /><span className="truncate">{d.label || "Speaker"}</span>
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>

              <Tooltip text={captionsEnabled ? "Turn off live captions" : captionsSupported ? "Turn on live captions (speech to text)" : "Live captions not supported in this browser"}>
                <button
                  onClick={toggleCaptions}
                  className={`meet-btn ${captionsEnabled ? "active-green" : ""} ${!captionsSupported ? "opacity-40 cursor-not-allowed" : ""}`}
                >
                  {captionsEnabled ? <CaptionsOff className="w-5 h-5" /> : <Captions className="w-5 h-5" />}
                </button>
              </Tooltip>

              <div className="w-px h-8 bg-meet-border mx-1" />
              <button onClick={() => setShowLeaveModal(true)} className="flex items-center gap-2 bg-meet-red hover:bg-red-600 text-white rounded-full px-5 h-11 font-medium text-sm transition-colors">
                <PhoneOff className="w-4 h-4" /><span className="hidden sm:inline">Leave</span>
              </button>
            </div>
          )}
        </div>

        {sidePanel && (
          <div className="w-72 sm:w-80 flex-shrink-0 meet-surface border-l border-meet-border flex flex-col animate-slide-in-right">
            {sidePanel === "chat" ? (
              <ChatPanel roomCode={roomCode!} localPeerId={peerIdRef.current} localName={displayName} />
            ) : (
              <ParticipantsList
                participants={peers} localPeerId={peerIdRef.current} localName={displayName}
                localIsHost={isHost} localIsMuted={isMuted} localIsCameraOff={isCameraOff}
                localIsMicLocked={isMicLocked} localIsCameraLocked={isCameraLocked} isHost={isHost}
                onMuteParticipant={(pid, mute) => managerRef.current?.hostControlParticipant(pid, mute ? "mute" : "unmute", mute)}
                onLockMic={(pid, lock) => managerRef.current?.hostControlParticipant(pid, lock ? "lock-mic" : "unlock-mic", lock)}
                onLockCamera={(pid, lock) => managerRef.current?.hostControlParticipant(pid, lock ? "lock-camera" : "unlock-camera", lock)}
              />
            )}
          </div>
        )}
      </div>

      <div className="pointer-events-none fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50" style={{ width: 160, height: 300 }}>
        {emojiParticles.map((p) => (
          <div
            key={p.id}
            className="emoji-particle absolute"
            style={{
              left: p.x,
              bottom: 0,
              fontSize: p.size,
              animationDelay: `${p.delay}ms`,
              "--drift": `${p.drift}px`,
            } as React.CSSProperties}
          >
            {p.emoji}
          </div>
        ))}
      </div>

      <LeaveModal
        isOpen={showLeaveModal}
        onClose={() => setShowLeaveModal(false)}
        onLeaveMeeting={handleLeaveMeeting}
        onLeaveRoom={handleLeaveRoom}
      />
    </div>
  );
};

export default MeetingRoom;