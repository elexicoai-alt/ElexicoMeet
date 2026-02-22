import React, { useRef, useEffect, useCallback, useState } from "react";
import { MicOff, VideoOff, ShieldAlert, Lock } from "lucide-react";
import { getInitials } from "@/lib/meetUtils";
import type { Reaction } from "@/lib/meetUtils";
import type { SignalQuality } from "@/lib/webrtc";

type Props = {
  stream: MediaStream | null;
  displayName: string;
  isMuted: boolean;
  isCameraOff: boolean;
  isMicLocked: boolean;
  isCameraLocked: boolean;
  isLocal?: boolean;
  isSpeaking?: boolean;
  isHost?: boolean;
  isSpeakerMuted?: boolean;
  reaction?: Reaction & { instanceId: number };
  blurIntensity?: number;
  signalQuality?: SignalQuality;
};

const SignalBars: React.FC<{ quality: SignalQuality; isLocal: boolean }> = ({ quality, isLocal }) => {
  if (isLocal) {
    return (
      <span className="inline-flex items-end gap-[2px]" style={{ height: 12 }}>
        {[1, 2, 3, 4, 5].map((b) => (
          <span
            key={b}
            className="rounded-sm"
            style={{ width: 3, height: `${b * 20}%`, background: "#4ade80" }}
          />
        ))}
      </span>
    );
  }

  const filled =
    quality === "excellent" ? 5 :
    quality === "good"      ? 4 :
    quality === "fair"      ? 3 :
    quality === "poor"      ? 2 : 1;

  const getBarColor = (barIndex: number) => {
    if (barIndex > filled) return "rgba(255,255,255,0.18)";
    if (quality === "excellent") return "#4ade80";
    if (quality === "good") {
      return barIndex <= 4 ? "#4ade80" : "rgba(255,255,255,0.18)";
    }
    if (quality === "fair") {
      return barIndex <= 3 ? "#4ade80" : "#ef4444";
    }
    if (quality === "poor") {
      return barIndex <= 2 ? "#4ade80" : "#ef4444";
    }
    return "#ef4444";
  };

  return (
    <span className="inline-flex items-end gap-[2px]" style={{ height: 12 }}>
      {[1, 2, 3, 4, 5].map((b) => (
        <span
          key={b}
          className="rounded-sm"
          style={{ width: 3, height: `${b * 20}%`, background: getBarColor(b) }}
        />
      ))}
    </span>
  );
};

const VideoTile: React.FC<Props> = ({
  stream, displayName, isMuted, isCameraOff, isMicLocked, isCameraLocked,
  isLocal = false, isSpeaking = false, isHost = false, isSpeakerMuted = false,
  reaction, blurIntensity = 0, signalQuality = "unknown",
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const segWorkerRef = useRef<{ worker: Worker | null; model: unknown } | null>(null);

  const [videoActive, setVideoActive] = useState(false);

  useEffect(() => {
    if (!stream) {
      setVideoActive(false);
      return;
    }

    const checkVideo = () => {
      const tracks = stream.getVideoTracks();
      const live = tracks.length > 0 && tracks[0].readyState === "live" && tracks[0].enabled;
      setVideoActive(live);
    };

    checkVideo();

    const tracks = stream.getVideoTracks();
    tracks.forEach((t) => {
      t.addEventListener("unmute", checkVideo);
      t.addEventListener("mute", checkVideo);
      t.addEventListener("ended", checkVideo);
    });

    stream.addEventListener("addtrack", checkVideo);
    stream.addEventListener("removetrack", checkVideo);

    return () => {
      tracks.forEach((t) => {
        t.removeEventListener("unmute", checkVideo);
        t.removeEventListener("mute", checkVideo);
        t.removeEventListener("ended", checkVideo);
      });
      stream.removeEventListener("addtrack", checkVideo);
      stream.removeEventListener("removetrack", checkVideo);
    };
  }, [stream]);

  const showVideo = videoActive && !isCameraOff;
  const blurActive = blurIntensity > 0 && showVideo && isLocal;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!stream) {
      video.srcObject = null;
      return;
    }
    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }
    video.muted = isLocal || isSpeakerMuted;
    video.play().catch(() => {});
  }, [stream, isLocal, isSpeakerMuted]);

  const startBlurLoop = useCallback((video: HTMLVideoElement, canvas: HTMLCanvasElement, intensity: number) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const render = () => {
      animRef.current = requestAnimationFrame(render);
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return;

      if (canvas.width !== vw || canvas.height !== vh) {
        canvas.width = vw;
        canvas.height = vh;
      }

      const blurPx = Math.round(intensity * 0.2);

      ctx.filter = `blur(${blurPx}px)`;
      ctx.drawImage(video, 0, 0, vw, vh);
      ctx.filter = "none";

      const padX = vw * 0.15;
      const padY = vh * 0.12;
      const faceW = vw - padX * 2;
      const faceH = vh - padY * 2;

      ctx.save();
      ctx.beginPath();
      const rx = faceW / 2;
      const ry = faceH / 2;
      const cx = vw / 2;
      const cy = vh / 2;
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(video, padX, padY, faceW, faceH, padX, padY, faceW, faceH);
      ctx.restore();
    };

    cancelAnimationFrame(animRef.current);
    if (!video.paused && video.readyState >= 2) {
      render();
    }
    const onPlaying = () => {
      cancelAnimationFrame(animRef.current);
      render();
    };
    video.addEventListener("playing", onPlaying);
    return () => {
      video.removeEventListener("playing", onPlaying);
      cancelAnimationFrame(animRef.current);
    };
  }, []);

  useEffect(() => {
    cancelAnimationFrame(animRef.current);
    if (!blurActive) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const cleanup = startBlurLoop(video, canvas, blurIntensity);
    return cleanup;
  }, [blurActive, blurIntensity, startBlurLoop]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(animRef.current);
      if (segWorkerRef.current?.worker) {
        segWorkerRef.current.worker.terminate();
      }
    };
  }, []);

  const avatarColor = `hsl(${Math.abs(displayName.charCodeAt(0) * 30) % 360} 60% 35%)`;

  return (
    <div className={`video-tile h-full w-full transition-all duration-150 ${isSpeaking ? "ring-2 ring-meet-blue" : ""}`}>
      {showVideo ? (
        <>
          <video
            ref={videoRef}
            autoPlay
            muted={isLocal || isSpeakerMuted}
            playsInline
            data-remote={!isLocal ? "true" : undefined}
            className={`w-full h-full object-cover ${blurActive ? "absolute inset-0 opacity-0" : "block"}`}
          />
          {blurActive && (
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}
        </>
      ) : (
        <>
          <video
            ref={videoRef}
            autoPlay
            muted={isLocal || isSpeakerMuted}
            playsInline
            data-remote={!isLocal ? "true" : undefined}
            className="hidden"
          />
          <div className="flex flex-col items-center justify-center h-full w-full gap-2">
            <div
              className="flex items-center justify-center rounded-full text-white font-semibold text-sm"
              style={{ width: 40, height: 40, background: avatarColor }}
            >
              {getInitials(displayName)}
            </div>
          </div>
        </>
      )}

      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-1">
        <span className="text-xs text-white bg-black/50 px-2 py-0.5 rounded flex items-center gap-1.5 min-w-0 truncate" style={{ borderRadius: 4 }}>
          <span className="truncate">{isLocal ? `${displayName} (You)` : displayName}</span>
          {isHost && (
            <span className="text-[10px] font-semibold bg-meet-yellow/20 text-meet-yellow border border-meet-yellow/30 px-1 flex-shrink-0" style={{ borderRadius: 3 }}>
              Host
            </span>
          )}
        </span>
        <span className="flex items-center flex-shrink-0">
          <SignalBars quality={signalQuality} isLocal={isLocal} />
        </span>
      </div>

      <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5">
        {isMuted && (
          <div className="bg-meet-red/90 rounded p-0.5" style={{ borderRadius: 3 }}>
            <MicOff className="w-2.5 h-2.5 text-white" />
          </div>
        )}
        {isMicLocked && (
          <div className="bg-meet-yellow/90 rounded p-0.5" style={{ borderRadius: 3 }}>
            <Lock className="w-2.5 h-2.5 text-black" />
          </div>
        )}
        {!showVideo && (
          <div className="bg-black/40 rounded p-0.5" style={{ borderRadius: 3 }}>
            <VideoOff className="w-2.5 h-2.5 text-white/70" />
          </div>
        )}
        {isCameraLocked && (
          <div className="bg-meet-yellow/90 rounded p-0.5" style={{ borderRadius: 3 }}>
            <ShieldAlert className="w-2.5 h-2.5 text-black" />
          </div>
        )}
      </div>

      {reaction && (
        <div
          key={reaction.instanceId}
          className="reaction-float absolute top-1/2 left-1/2 flex flex-col items-center gap-1.5 select-none pointer-events-none z-20"
        >
          <span className="text-5xl drop-shadow-2xl leading-none">{reaction.emoji}</span>
          <span className="text-xs text-white bg-black/70 px-3 py-1 rounded-full font-medium tracking-wide whitespace-nowrap">
            {reaction.label}
          </span>
        </div>
      )}
    </div>
  );
};

export default VideoTile;