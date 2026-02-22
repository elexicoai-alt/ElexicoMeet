import React from "react";
import { PhoneOff, LogOut, X } from "lucide-react";

interface LeaveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLeaveMeeting: () => void;
  onLeaveRoom: () => void;
}

const LeaveModal: React.FC<LeaveModalProps> = ({
  isOpen,
  onClose,
  onLeaveMeeting,
  onLeaveRoom,
}) => {
  if (!isOpen) return null;

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      {/* Modal panel */}
      <div
        className="relative w-full max-w-sm mx-4 rounded-2xl border border-meet-border shadow-2xl p-6"
        style={{ background: "hsl(220 20% 10%)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-meet-text-muted hover:text-meet-text transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center">
            <PhoneOff className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h2 className="text-meet-text font-semibold text-base">Leave meeting?</h2>
            <p className="text-meet-text-muted text-xs">Choose what you'd like to do</p>
          </div>
        </div>

        <div className="h-px bg-meet-border my-4" />

        {/* Options */}
        <div className="flex flex-col gap-3">
          {/* Leave Meeting — disconnects call, returns to home (session preserved) */}
          <button
            onClick={onLeaveMeeting}
            className="w-full flex items-start gap-3 rounded-xl px-4 py-3 border border-meet-border hover:border-red-500/50 hover:bg-red-500/10 transition-all text-left group"
          >
            <div className="mt-0.5 w-8 h-8 rounded-full bg-red-500/15 flex items-center justify-center flex-shrink-0 group-hover:bg-red-500/25 transition-colors">
              <PhoneOff className="w-4 h-4 text-red-400" />
            </div>
            <div>
              <p className="text-meet-text text-sm font-medium">Leave Meeting</p>
              <p className="text-meet-text-muted text-xs mt-0.5 leading-relaxed">
                Disconnect from the call. Your name will be remembered if you rejoin.
              </p>
            </div>
          </button>

          {/* Leave Room — full exit, clears session */}
          <button
            onClick={onLeaveRoom}
            className="w-full flex items-start gap-3 rounded-xl px-4 py-3 border border-meet-border hover:border-orange-500/50 hover:bg-orange-500/10 transition-all text-left group"
          >
            <div className="mt-0.5 w-8 h-8 rounded-full bg-orange-500/15 flex items-center justify-center flex-shrink-0 group-hover:bg-orange-500/25 transition-colors">
              <LogOut className="w-4 h-4 text-orange-400" />
            </div>
            <div>
              <p className="text-meet-text text-sm font-medium">Leave Room</p>
              <p className="text-meet-text-muted text-xs mt-0.5 leading-relaxed">
                Exit completely and return to the home screen.
              </p>
            </div>
          </button>
        </div>

        {/* Cancel */}
        <button
          onClick={onClose}
          className="w-full mt-3 py-2.5 rounded-xl text-sm text-meet-text-muted hover:text-meet-text hover:bg-meet-surface-2 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

export default LeaveModal;
