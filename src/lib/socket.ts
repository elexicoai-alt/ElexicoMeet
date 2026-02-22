import { io, Socket } from "socket.io-client";

const DEFAULT_URL = `${window.location.protocol}//${window.location.hostname}:3001`;
const URL = import.meta.env.VITE_SOCKET_URL || DEFAULT_URL;

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });
    socket.on("error", (error) => {
      console.error("Socket error:", error);
    });
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}
