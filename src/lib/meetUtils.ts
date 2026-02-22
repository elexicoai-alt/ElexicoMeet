import type { LucideIcon } from "lucide-react";

export function generateRoomCode(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz";
  const seg = () =>
    Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `${seg()}-${seg()}-${seg()}`;
}

export function generatePeerId(): string {
  return `peer-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function getOrCreatePeerId(roomCode: string): string {
  const key = `elexico-peer-${roomCode}`;
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;
  const id = generatePeerId();
  sessionStorage.setItem(key, id);
  return id;
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

export type Reaction = {
  id: string;
  emoji: string;
  label: string;
};

export const REACTIONS: Reaction[] = [
  { id: "hand",      emoji: "✋", label: "Raise Hand"    },
  { id: "agree",     emoji: "👍", label: "Agree"         },
  { id: "disagree",  emoji: "👎", label: "Disagree"      },
  { id: "love",      emoji: "❤️", label: "Love"          },
  { id: "laugh",     emoji: "😂", label: "Haha"          },
  { id: "wow",       emoji: "😮", label: "Wow"           },
  { id: "question",  emoji: "🙋", label: "Question"      },
  { id: "clap",      emoji: "👏", label: "Clap"          },
  { id: "slow",      emoji: "🐢", label: "Slow Down"     },
  { id: "fast",      emoji: "⚡", label: "Speed Up"      },
  { id: "break",     emoji: "☕", label: "Need a Break"  },
  { id: "fire",      emoji: "🔥", label: "Fire"          },
];