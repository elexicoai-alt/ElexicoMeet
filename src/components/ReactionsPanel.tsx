import React from "react";
import { REACTIONS } from "@/lib/meetUtils";
import type { Reaction } from "@/lib/meetUtils";

type Props = {
  onReact: (reaction: Reaction) => void;
  onClose: () => void;
};

const ReactionsPanel: React.FC<Props> = ({ onReact, onClose }) => {
  return (
    <div className="glass-panel rounded-2xl p-3 shadow-2xl border border-meet-border" style={{ width: 280 }}>
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-xs text-meet-text-muted font-semibold uppercase tracking-wide">Reactions</span>
        <button onClick={onClose} className="text-meet-text-muted hover:text-meet-text text-xs">✕</button>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {REACTIONS.map((r) => (
          <button
            key={r.id}
            onClick={(e) => {
              e.stopPropagation();
              onReact(r);
            }}
            className="flex flex-col items-center gap-1 px-1 py-2 rounded-xl hover:bg-white/10 active:scale-90 transition-all group"
            title={r.label}
          >
            <span className="text-2xl leading-none group-hover:scale-125 transition-transform duration-150 select-none">
              {r.emoji}
            </span>
            <span className="text-[10px] text-meet-text-muted leading-tight text-center">{r.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default ReactionsPanel;