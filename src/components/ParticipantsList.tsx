import React, { useState } from "react";
import { Mic, MicOff, VideoOff, Video, Lock, ShieldAlert, ChevronDown } from "lucide-react";
import { getInitials } from "@/lib/meetUtils";
import { PeerConnection } from "@/lib/webrtc";

type Props = {
  participants: PeerConnection[];
  localPeerId: string;
  localName: string;
  localIsHost: boolean;
  localIsMuted: boolean;
  localIsCameraOff: boolean;
  localIsMicLocked: boolean;
  localIsCameraLocked: boolean;
  isHost: boolean;
  onMuteParticipant: (peerId: string, mute: boolean) => void;
  onLockMic: (peerId: string, lock: boolean) => void;
  onLockCamera: (peerId: string, lock: boolean) => void;
};

const ParticipantsList: React.FC<Props> = ({
  participants,
  localPeerId,
  localName,
  localIsHost,
  localIsMuted,
  localIsCameraOff,
  localIsMicLocked,
  localIsCameraLocked,
  isHost,
  onMuteParticipant,
  onLockMic,
  onLockCamera,
}) => {
  const [expandedPeer, setExpandedPeer] = useState<string | null>(null);

  const all = [
    {
      peerId: localPeerId,
      displayName: localName,
      isHost: localIsHost,
      isMuted: localIsMuted,
      isCameraOff: localIsCameraOff,
      isMicLocked: localIsMicLocked,
      isCameraLocked: localIsCameraLocked,
      isLocal: true,
    },
    ...participants.map((p) => ({ ...p, isLocal: false })),
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-meet-border">
        <h3 className="text-sm font-semibold text-meet-text">Participants ({all.length})</h3>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {all.map((p) => {
          const isExpanded = expandedPeer === p.peerId;
          const canControl = isHost && !p.isLocal;
          const avatarColor = `hsl(${Math.abs(p.displayName.charCodeAt(0) * 30) % 360} 60% 35%)`;

          return (
            <div key={p.peerId} className="px-3 py-1">
              <div
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${canControl ? "cursor-pointer hover:bg-meet-surface-2" : ""} ${isExpanded ? "bg-meet-surface-2" : ""}`}
                onClick={() => canControl && setExpandedPeer(isExpanded ? null : p.peerId)}
              >
                <div
                  className="flex-shrink-0 flex items-center justify-center rounded-full text-xs font-semibold text-white"
                  style={{ width: 34, height: 34, background: avatarColor }}
                >
                  {getInitials(p.displayName)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm text-meet-text font-medium truncate">{p.displayName}</span>
                    {p.isLocal && <span className="text-meet-text-muted text-xs">(You)</span>}
                    {p.isHost && (
                      <span className="text-[10px] font-semibold bg-meet-yellow/15 text-meet-yellow border border-meet-yellow/25 px-1.5 py-0.5 flex-shrink-0" style={{ borderRadius: 3 }}>
                        Host
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {p.isMuted
                      ? <MicOff className="w-3 h-3 text-meet-red" />
                      : <Mic className="w-3 h-3 text-meet-green" />
                    }
                    {p.isCameraOff
                      ? <VideoOff className="w-3 h-3 text-meet-text-muted" />
                      : <Video className="w-3 h-3 text-meet-green" />
                    }
                    {p.isMicLocked && <Lock className="w-3 h-3 text-meet-yellow" />}
                    {p.isCameraLocked && <ShieldAlert className="w-3 h-3 text-meet-yellow" />}
                  </div>
                </div>

                {canControl && (
                  <ChevronDown className={`w-3.5 h-3.5 text-meet-text-muted flex-shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                )}
              </div>

              {canControl && isExpanded && (
                <div className="mx-3 mb-1 border border-meet-border rounded-lg overflow-hidden">
                  <button
                    onClick={(e) => { e.stopPropagation(); onMuteParticipant(p.peerId, !p.isMuted); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-meet-surface-2 transition-colors border-b border-meet-border"
                  >
                    {p.isMuted
                      ? <Mic className="w-4 h-4 text-meet-green flex-shrink-0" />
                      : <MicOff className="w-4 h-4 text-meet-red flex-shrink-0" />
                    }
                    <span className="text-meet-text">{p.isMuted ? "Unmute participant" : "Mute participant"}</span>
                  </button>

                  <button
                    onClick={(e) => { e.stopPropagation(); onLockMic(p.peerId, !p.isMicLocked); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-meet-surface-2 transition-colors border-b border-meet-border"
                  >
                    <Lock className={`w-4 h-4 flex-shrink-0 ${p.isMicLocked ? "text-meet-yellow" : "text-meet-text-muted"}`} />
                    <span className="text-meet-text">{p.isMicLocked ? "Unlock mic" : "Lock mic"}</span>
                  </button>

                  <button
                    onClick={(e) => { e.stopPropagation(); onLockCamera(p.peerId, !p.isCameraLocked); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-meet-surface-2 transition-colors"
                  >
                    <ShieldAlert className={`w-4 h-4 flex-shrink-0 ${p.isCameraLocked ? "text-meet-yellow" : "text-meet-text-muted"}`} />
                    <span className="text-meet-text">{p.isCameraLocked ? "Unlock camera" : "Lock camera"}</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ParticipantsList;