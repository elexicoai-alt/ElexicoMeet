import React, { useState, useRef, useEffect } from "react";
import { Send, Smile } from "lucide-react";
import { getSocket } from "@/lib/socket";
import { formatTime } from "@/lib/meetUtils";

type Message = {
  id: string;
  peerId: string;
  senderName: string;
  content: string;
  timestamp: number;
};

type Props = {
  roomCode: string;
  localPeerId: string;
  localName: string;
};

const ChatPanel: React.FC<Props> = ({ roomCode, localPeerId, localName }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const socket = getSocket();

    
    const onConnect = () => {
      socket.emit("get-chat-history", { roomCode });
    };

    if (socket.connected) {
      onConnect();
    } else {
      socket.once("connect", onConnect);
    }

    const onChatHistory = (history: Message[]) => {
      setMessages(history);
    };

    const onChatMessage = (message: Message) => {
      setMessages((prev) => [...prev, message]);
    };

    socket.on("chat-history", onChatHistory);
    socket.on("chat-message", onChatMessage);

    return () => {
      socket.off("chat-history", onChatHistory);
      socket.off("chat-message", onChatMessage);
    };
  }, [roomCode]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    
    const socket = getSocket();
    if (!socket.connected) {
      console.warn("Socket not connected, reconnecting...");
      return;
    }
    
    setInput("");
    socket.emit("chat-message", {
      roomCode,
      peerId: localPeerId,
      senderName: localName,
      content: trimmed,
    }, (error?: string) => {
      if (error) {
        console.error("Failed to send message:", error);
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-meet-border">
        <h3 className="text-sm font-semibold text-meet-text">In-call Messages</h3>
        <p className="text-xs text-meet-text-muted mt-0.5">
          Messages are visible to everyone in this call
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-meet-text-muted text-sm gap-2">
            <Smile className="w-8 h-8 opacity-40" />
            <span>No messages yet</span>
          </div>
        )}
        {messages.map((msg) => {
          const isSelf = msg.peerId === localPeerId;
          return (
            <div key={msg.id} className={`flex flex-col ${isSelf ? "items-end" : "items-start"}`}>
              {!isSelf && (
                <span className="text-xs text-meet-text-muted mb-1 px-1">{msg.senderName}</span>
              )}
              <div
                className={`px-3 py-2 text-sm text-meet-text max-w-[85%] ${
                  isSelf ? "chat-message-self" : "chat-message-other"
                }`}
              >
                {msg.content}
              </div>
              <span className="text-xs text-meet-text-muted mt-1 px-1">
                {formatTime(new Date(msg.timestamp))}
              </span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="px-3 py-3 border-t border-meet-border">
        <div className="flex items-end gap-2 bg-meet-surface-2 rounded-xl px-3 py-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Send a message..."
            rows={1}
            className="flex-1 bg-transparent text-meet-text text-sm resize-none outline-none placeholder:text-meet-text-muted max-h-24"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim()}
            className="flex-shrink-0 p-1.5 rounded-full hover:bg-meet-border disabled:opacity-30 transition-colors"
          >
            <Send className="w-4 h-4 text-meet-blue" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;