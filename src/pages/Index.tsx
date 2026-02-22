import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Video,
  ArrowRight,
  Keyboard,
  MicOff,
  PhoneOff,
  CircleDot,
  ShieldCheck,
  Aperture,
  Monitor,
  Volume2,
  Smile,
} from "lucide-react";
import { generateRoomCode } from "@/lib/meetUtils";
import GoogleLoginButton, { type GoogleUser } from "@/components/GoogleLoginButton";

const FEATURES = [
  {
    icon: CircleDot,
    title: "Full Recording",
    desc: "Record all voices including yours",
    color: "text-red-400",
    bg: "bg-red-500/10",
  },
  {
    icon: ShieldCheck,
    title: "Host Controls",
    desc: "Mute, lock mic & camera",
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
  },
  {
    icon: Aperture,
    title: "Background Blur",
    desc: "Professional video filters",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
  },
  {
    icon: Monitor,
    title: "Screen Share",
    desc: "Present your screen live",
    color: "text-green-400",
    bg: "bg-green-500/10",
  },
  {
    icon: Volume2,
    title: "Speaker Control",
    desc: "Mute remote audio anytime",
    color: "text-purple-400",
    bg: "bg-purple-500/10",
  },
  {
    icon: Smile,
    title: "Reactions",
    desc: "Express yourself live",
    color: "text-orange-400",
    bg: "bg-orange-500/10",
  },
];

const Index: React.FC = () => {
  const navigate = useNavigate();
  const [nameInput, setNameInput] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"new" | "join">("new");
  const [googleUser, setGoogleUser] = useState<GoogleUser | null>(null);
  const [googleError, setGoogleError] = useState(false);

  const handleGoogleSuccess = (user: GoogleUser) => {
    setGoogleError(false);
    setGoogleUser(user);
    setNameInput(user.name);
  };

  const handleNewMeeting = () => {
    if (!nameInput.trim()) return;
    setLoading(true);
    const code = generateRoomCode();
    sessionStorage.setItem("elexico-name", nameInput.trim());
    sessionStorage.setItem("elexico-host", "true");
    navigate(`/meeting/${code}`);
  };

  const handleJoinMeeting = () => {
    if (!nameInput.trim() || !joinCode.trim()) return;
    setLoading(true);
    const code = joinCode.trim().toLowerCase().replace(/\s/g, "");
    sessionStorage.setItem("elexico-name", nameInput.trim());
    sessionStorage.setItem("elexico-host", "false");
    navigate(`/meeting/${code}`);
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'hsl(220 20% 97%)' }}>
      <header className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Video className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="text-lg font-semibold text-foreground tracking-tight">Elexico Meet</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="hidden sm:block">
            {new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
          </span>
          <span className="hidden sm:block text-border">·</span>
          <span className="hidden sm:block">
            {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
          </span>
        </div>
      </header>

      <main className="flex flex-1 flex-col lg:flex-row items-center justify-center px-6 py-12 gap-16 max-w-6xl mx-auto w-full">
        <div className="flex-1 max-w-lg">
          <h1 className="text-4xl sm:text-5xl font-semibold text-foreground leading-tight mb-4">
            Video calls and meetings for everyone
          </h1>
          <p className="text-muted-foreground text-lg mb-8 leading-relaxed">
            Connect, collaborate, and celebrate from anywhere with Elexico Meet. Record full meetings with all audio, host controls, background blur, and more.
          </p>

          <div className="mb-6">
            {/* Google sign-in */}
            {!googleUser ? (
              <div className="mb-4">
                <p className="text-sm text-muted-foreground mb-2">Sign in with Google to auto-fill your name:</p>
                <GoogleLoginButton
                  onSuccess={handleGoogleSuccess}
                  onError={() => setGoogleError(true)}
                />
                {googleError && (
                  <p className="text-xs text-red-500 mt-1">Google sign-in failed. Try again or enter your name manually.</p>
                )}
                <div className="flex items-center gap-2 my-3">
                  <div className="flex-1 border-t border-border" />
                  <span className="text-xs text-muted-foreground">or enter manually</span>
                  <div className="flex-1 border-t border-border" />
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 mb-4 p-3 bg-card border border-border rounded-xl">
                <img src={googleUser.picture} alt={googleUser.name} className="w-8 h-8 rounded-full" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{googleUser.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{googleUser.email}</p>
                </div>
                <button
                  onClick={() => { setGoogleUser(null); setNameInput(""); }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Switch
                </button>
              </div>
            )}

            <input
              type="text"
              placeholder="Your name"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && tab === "new" && handleNewMeeting()}
              className="w-full border border-border rounded-xl px-4 py-3 text-foreground bg-card text-base outline-none focus:ring-2 focus:ring-primary/40 transition"
            />
          </div>

          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setTab("new")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === "new"
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              }`}
            >
              New Meeting
            </button>
            <button
              onClick={() => setTab("join")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === "join"
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              }`}
            >
              Join Meeting
            </button>
          </div>

          {tab === "new" ? (
            <button
              onClick={handleNewMeeting}
              disabled={!nameInput.trim() || loading}
              className="flex items-center gap-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-xl px-6 py-3 font-medium transition-colors"
            >
              <Video className="w-4 h-4" />
              {loading ? "Starting..." : "Start a meeting"}
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Keyboard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Enter meeting code (e.g. abc-def-ghi)"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleJoinMeeting()}
                  className="w-full border border-border rounded-xl pl-10 pr-4 py-3 text-foreground bg-card text-sm outline-none focus:ring-2 focus:ring-primary/40 transition"
                />
              </div>
              <button
                onClick={handleJoinMeeting}
                disabled={!nameInput.trim() || !joinCode.trim() || loading}
                className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-xl px-5 py-3 font-medium transition-colors"
              >
                {loading ? "..." : "Join"}
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 max-w-md w-full">
          <div className="bg-meet-bg rounded-2xl overflow-hidden shadow-2xl">
            <div className="p-4 flex items-center justify-between bg-meet-surface border-b border-meet-border">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded bg-primary/80 flex items-center justify-center">
                  <Video className="w-3 h-3 text-white" />
                </div>
                <span className="text-meet-text text-sm font-medium">Elexico Meet</span>
              </div>
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-meet-red opacity-70" />
                <div className="w-3 h-3 rounded-full bg-meet-yellow opacity-70" />
                <div className="w-3 h-3 rounded-full bg-meet-green opacity-70" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 p-3">
              {["Alex M.", "Priya S.", "Jordan K.", "Sam T."].map((name, i) => (
                <div
                  key={name}
                  className="aspect-video rounded-xl flex items-center justify-center relative overflow-hidden"
                  style={{ background: `hsl(${i * 70 + 200} 40% 20%)` }}
                >
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-semibold text-white"
                    style={{ background: `hsl(${i * 70 + 200} 60% 40%)` }}
                  >
                    {name.split(" ").map((n) => n[0]).join("")}
                  </div>
                  <div className="absolute bottom-1.5 left-2">
                    <span className="text-xs text-white/90 bg-black/40 px-1.5 py-0.5 rounded-full">{name}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-center gap-3 py-3 bg-meet-surface border-t border-meet-border">
              <div className="w-9 h-9 rounded-full bg-meet-red flex items-center justify-center">
                <MicOff className="w-4 h-4 text-white" />
              </div>
              <div className="w-9 h-9 rounded-full bg-meet-surface-2 flex items-center justify-center border border-meet-border">
                <Video className="w-4 h-4 text-white/70" />
              </div>
              <div className="w-9 h-9 rounded-full bg-meet-red flex items-center justify-center">
                <PhoneOff className="w-4 h-4 text-white" />
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="bg-card border border-border rounded-xl p-3 text-center flex flex-col items-center gap-1.5">
                <div className={`w-8 h-8 rounded-lg ${f.bg} flex items-center justify-center`}>
                  <f.icon className={`w-4 h-4 ${f.color}`} />
                </div>
                <div className="text-xs font-semibold text-foreground">{f.title}</div>
                <div className="text-xs text-muted-foreground leading-tight">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </main>

      <footer className="border-t border-border py-4 px-6 text-center">
        <p className="text-xs text-muted-foreground">
          Elexico Meet — Secure, free, peer-to-peer video conferencing
        </p>
      </footer>
    </div>
  );
};

export default Index;