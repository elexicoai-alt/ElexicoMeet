import { useRef, useCallback, useState } from "react";

export type RecordingState = "idle" | "recording" | "stopped";
export type RecordingMode = "participants" | "fullscreen" | "presenter";

export function useMeetRecorder() {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const fileHandleRef = useRef<FileSystemFileHandle | null>(null);
  const writableRef = useRef<FileSystemWritableFileStream | null>(null);
  const animFrameRef = useRef<number>(0);
  const [state, setState] = useState<RecordingState>("idle");
  const [mode, setMode] = useState<RecordingMode>("participants");

  const pickSaveLocation = useCallback(async (ext: string): Promise<boolean> => {
    if (!("showSaveFilePicker" in window)) return false;
    try {
      const handle = await (window as Window & typeof globalThis & {
        showSaveFilePicker: (opts: object) => Promise<FileSystemFileHandle>;
      }).showSaveFilePicker({
        suggestedName: `elexico-meet-recording-${new Date().toISOString().replace(/[:.]/g, "-")}.${ext}`,
        types: [
          {
            description: "Video File",
            accept: ext === "mp4" ? { "video/mp4": [".mp4"] } : { "video/webm": [".webm"] },
          },
        ],
      });
      fileHandleRef.current = handle;
      writableRef.current = await handle.createWritable();
      return true;
    } catch {
      return false;
    }
  }, []);

  const buildAudioMix = useCallback((
    audioCtx: AudioContext,
    localStream: MediaStream,
    remoteStreams: MediaStream[]
  ): MediaStream => {
    const destination = audioCtx.createMediaStreamDestination();
    audioContextRef.current = audioCtx;

    const addStream = (stream: MediaStream) => {
      if (!stream) return;
      const tracks = stream.getAudioTracks();
      if (tracks.length === 0) return;
      const liveTracks = tracks.filter((t) => t.readyState === "live" && t.enabled);
      if (liveTracks.length === 0) return;
      try {
        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(destination);
      } catch {}
    };

    addStream(localStream);
    remoteStreams.forEach(addStream);

    return destination.stream;
  }, []);

  const startRecording = useCallback(
    async (
      localStream: MediaStream,
      remoteStreams: MediaStream[],
      recordingMode: RecordingMode = "participants",
      presenterStream?: MediaStream,
      containerEl?: HTMLElement
    ) => {
      if (recorderRef.current && recorderRef.current.state !== "inactive") return;

      setMode(recordingMode);

      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
        ? "video/webm;codecs=vp8,opus"
        : MediaRecorder.isTypeSupported("video/webm")
        ? "video/webm"
        : MediaRecorder.isTypeSupported("video/mp4")
        ? "video/mp4"
        : "video/webm";

      const ext = mimeType.includes("mp4") ? "mp4" : "webm";

      const audioCtx = new AudioContext();
      if (audioCtx.state === "suspended") {
        try { await audioCtx.resume(); } catch {}
      }

      const mixedAudio = buildAudioMix(audioCtx, localStream, remoteStreams);

      let videoTrack: MediaStreamTrack | null = null;

      if (recordingMode === "fullscreen") {
        try {
          const target = containerEl ?? document.documentElement;
          const W = target.clientWidth || window.innerWidth;
          const H = target.clientHeight || window.innerHeight;

          const canvas = document.createElement("canvas");
          canvas.width = W;
          canvas.height = H;
          const ctx2d = canvas.getContext("2d");

          if (ctx2d) {
            ctx2d.fillStyle = "#0f1117";
            ctx2d.fillRect(0, 0, W, H);
          }

          const canvasStream = (canvas as HTMLCanvasElement & {
            captureStream: (fps?: number) => MediaStream;
          }).captureStream(30);
          videoTrack = canvasStream.getVideoTracks()[0] ?? null;

          const drawFrame = () => {
            animFrameRef.current = requestAnimationFrame(drawFrame);
            if (!ctx2d) return;

            ctx2d.fillStyle = "#0f1117";
            ctx2d.fillRect(0, 0, W, H);

            const videoEls = Array.from(
              document.querySelectorAll<HTMLVideoElement>("video")
            ).filter((v) => v.srcObject && !v.paused && v.videoWidth > 0);

            if (videoEls.length === 0) return;

            const cols = videoEls.length === 1 ? 1 : videoEls.length <= 4 ? 2 : 3;
            const rows = Math.ceil(videoEls.length / cols);
            const cellW = W / cols;
            const cellH = H / rows;
            const padding = 6;

            videoEls.forEach((v, i) => {
              const col = i % cols;
              const row = Math.floor(i / cols);
              const x = col * cellW + padding;
              const y = row * cellH + padding;
              const w = cellW - padding * 2;
              const h = cellH - padding * 2;

              ctx2d.save();
              ctx2d.beginPath();
              ctx2d.roundRect(x, y, w, h, 8);
              ctx2d.clip();

              const vr = v.videoWidth / v.videoHeight;
              const cr = w / h;
              let sx = 0, sy = 0, sw = v.videoWidth, sh = v.videoHeight;
              if (vr > cr) {
                sw = v.videoHeight * cr;
                sx = (v.videoWidth - sw) / 2;
              } else {
                sh = v.videoWidth / cr;
                sy = (v.videoHeight - sh) / 2;
              }
              ctx2d.drawImage(v, sx, sy, sw, sh, x, y, w, h);
              ctx2d.restore();
            });
          };
          drawFrame();
        } catch {
          cancelAnimationFrame(animFrameRef.current);
          audioCtx.close();
          return;
        }
      } else if (recordingMode === "presenter" && presenterStream) {
        const vt = presenterStream.getVideoTracks().find((t) => t.readyState === "live");
        videoTrack = vt ?? null;
      } else {
        const vt = localStream.getVideoTracks().find((t) => t.readyState === "live");
        videoTrack = vt ?? null;
      }

      const combinedStream = videoTrack
        ? new MediaStream([videoTrack, ...mixedAudio.getTracks()])
        : new MediaStream(mixedAudio.getTracks());

      const usedFilePicker = await pickSaveLocation(ext);

      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: 2500000 });
      } catch {
        try {
          recorder = new MediaRecorder(combinedStream, { mimeType });
        } catch {
          cancelAnimationFrame(animFrameRef.current);
          audioCtx.close();
          return;
        }
      }

      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = async (e) => {
        if (e.data.size === 0) return;
        if (usedFilePicker && writableRef.current) {
          try {
            await writableRef.current.write(e.data);
          } catch {}
        } else {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        cancelAnimationFrame(animFrameRef.current);

        if (usedFilePicker && writableRef.current) {
          try {
            await writableRef.current.close();
          } catch {}
          writableRef.current = null;
          fileHandleRef.current = null;
        } else {
          if (chunksRef.current.length === 0) {
            try { audioCtx.close(); } catch {}
            setState("stopped");
            return;
          }
          const blob = new Blob(chunksRef.current, { type: mimeType });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `elexico-meet-recording-${new Date().toISOString().replace(/[:.]/g, "-")}.${ext}`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 5000);
        }
        try { audioCtx.close(); } catch {}
        setState("stopped");
      };

      recorder.start(250);
      setState("recording");
    },
    [buildAudioMix, pickSaveLocation]
  );

  const stopRecording = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    recorder.requestData();
    recorder.stop();
  }, []);

  return { startRecording, stopRecording, recordingState: state, recordingMode: mode };
}
