import { getSocket } from "./socket";
import type { Socket } from "socket.io-client";

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
  iceCandidatePoolSize: 10,
};

export type SignalQuality = "excellent" | "good" | "fair" | "poor" | "unknown";

export type PeerConnection = {
  peerId: string;
  displayName: string;
  isHost: boolean;
  connection: RTCPeerConnection;
  stream: MediaStream | null;
  isMuted: boolean;
  isCameraOff: boolean;
  isMicLocked: boolean;
  isCameraLocked: boolean;
  isScreenSharing: boolean;
  signalQuality: SignalQuality;
  audioSender: RTCRtpSender;
  videoSender: RTCRtpSender;
};

type SignalHandler = (fromPeer: string, signal: object) => void;
type ParticipantChangeHandler = () => void;

function rttToQuality(rtt: number | undefined): SignalQuality {
  if (rtt === undefined) return "unknown";
  if (rtt < 80) return "excellent";
  if (rtt < 200) return "good";
  if (rtt < 400) return "fair";
  return "poor";
}

export class WebRTCManager {
  private localPeerId: string;
  private roomCode: string;
  private displayName: string;
  private isHost: boolean;
  private peers: Map<string, PeerConnection> = new Map();
  private localStream: MediaStream | null = null;
  private onPeersChanged: ParticipantChangeHandler;
  private onSignal: SignalHandler | null = null;
  private socket: Socket;
  private statsInterval: ReturnType<typeof setInterval> | null = null;
  private pendingCandidates: Map<string, RTCIceCandidateInit[]> = new Map();
  private makingOffer: Map<string, boolean> = new Map();
  private ignoreOffer: Map<string, boolean> = new Map();
  private offerTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private destroyed = false;

  
  private _onExistingPeers: ((data: unknown) => void) | null = null;
  private _onPeerJoined: ((data: unknown) => void) | null = null;
  private _onPeerLeft: ((data: unknown) => void) | null = null;
  private _onSignal: ((data: unknown) => void) | null = null;
  private _onParticipantUpdated: ((data: unknown) => void) | null = null;
  private _onScreenShareState: ((data: unknown) => void) | null = null;
  private _onHostControl: ((data: unknown) => void) | null = null;
  private _onReaction: ((data: unknown) => void) | null = null;

  constructor(
    peerId: string,
    roomCode: string,
    displayName: string,
    isHost: boolean,
    onPeersChanged: ParticipantChangeHandler
  ) {
    this.localPeerId = peerId;
    this.roomCode = roomCode;
    this.displayName = displayName;
    this.isHost = isHost;
    this.onPeersChanged = onPeersChanged;
    this.socket = getSocket();
  }

  async initialize(localStream: MediaStream) {
    this.localStream = localStream;
    this.setupSocketListeners();
    this.socket.emit("join-room", {
      roomCode: this.roomCode,
      peerId: this.localPeerId,
      displayName: this.displayName,
      isHost: this.isHost,
    });
    this.startStatsPolling();
  }

  private setupSocketListeners() {
    
    this.removeSocketListeners();

    this._onExistingPeers = async (data: unknown) => {
      if (this.destroyed) return;
      const { peers } = data as {
        peers: {
          peerId: string; displayName: string; isHost: boolean;
          isMuted: boolean; isCameraOff: boolean;
          isMicLocked: boolean; isCameraLocked: boolean;
        }[];
      };
      for (const peer of peers) {
        if (peer.peerId === this.localPeerId) continue;
        await this.ensurePeerConnection(peer.peerId, peer.displayName, peer.isHost, {
          isMuted: peer.isMuted,
          isCameraOff: peer.isCameraOff,
          isMicLocked: peer.isMicLocked,
          isCameraLocked: peer.isCameraLocked,
        });
        
        await this.createAndSendOffer(peer.peerId);
      }
    };

    this._onPeerJoined = async (data: unknown) => {
      if (this.destroyed) return;
      const { peerId, displayName, isHost } = data as {
        peerId: string; displayName: string; isHost: boolean;
      };
      if (peerId === this.localPeerId) return;
      await this.ensurePeerConnection(peerId, displayName, isHost, {
        isMuted: true,
        isCameraOff: true,
        isMicLocked: false,
        isCameraLocked: false,
      });
      
    };

    this._onPeerLeft = (data: unknown) => {
      if (this.destroyed) return;
      const { peerId } = data as { peerId: string };
      this.cleanupPeer(peerId);
      this.onPeersChanged();
    };

    this._onSignal = async (data: unknown) => {
      if (this.destroyed) return;
      const { fromPeer, type, payload } = data as {
        fromPeer: string; type: string; payload: object;
      };
      await this.handleSignal(fromPeer, type, payload);
    };

    this._onParticipantUpdated = (data: unknown) => {
      if (this.destroyed) return;
      const { peerId, isMuted, isCameraOff, isMicLocked, isCameraLocked } = data as {
        peerId: string; isMuted: boolean; isCameraOff: boolean;
        isMicLocked: boolean; isCameraLocked: boolean;
      };
      const peer = this.peers.get(peerId);
      if (peer) {
        peer.isMuted = isMuted;
        peer.isCameraOff = isCameraOff;
        peer.isMicLocked = isMicLocked;
        peer.isCameraLocked = isCameraLocked;
        this.onPeersChanged();
      }
    };

    this._onScreenShareState = (data: unknown) => {
      if (this.destroyed) return;
      const { fromPeer, payload } = data as {
        fromPeer: string; payload: { isSharing: boolean };
      };
      const peer = this.peers.get(fromPeer);
      if (peer) {
        peer.isScreenSharing = payload.isSharing;
        this.onPeersChanged();
      }
    };

    this._onHostControl = (data: unknown) => {
      if (this.destroyed) return;
      const { fromPeer, payload } = data as { fromPeer: string; payload: object };
      this.onSignal?.(fromPeer, payload);
    };

    this._onReaction = (data: unknown) => {
      if (this.destroyed) return;
      const { fromPeer, payload } = data as { fromPeer: string; payload: object };
      this.onSignal?.(fromPeer, { ...(payload as object), _type: "reaction" });
    };

    this.socket.on("existing-peers", this._onExistingPeers);
    this.socket.on("peer-joined", this._onPeerJoined);
    this.socket.on("peer-left", this._onPeerLeft);
    this.socket.on("signal", this._onSignal);
    this.socket.on("participant-updated", this._onParticipantUpdated);
    this.socket.on("screen-share-state", this._onScreenShareState);
    this.socket.on("host-control", this._onHostControl);
    this.socket.on("reaction", this._onReaction);
  }

  private removeSocketListeners() {
    if (this._onExistingPeers) this.socket.off("existing-peers", this._onExistingPeers);
    if (this._onPeerJoined) this.socket.off("peer-joined", this._onPeerJoined);
    if (this._onPeerLeft) this.socket.off("peer-left", this._onPeerLeft);
    if (this._onSignal) this.socket.off("signal", this._onSignal);
    if (this._onParticipantUpdated) this.socket.off("participant-updated", this._onParticipantUpdated);
    if (this._onScreenShareState) this.socket.off("screen-share-state", this._onScreenShareState);
    if (this._onHostControl) this.socket.off("host-control", this._onHostControl);
    if (this._onReaction) this.socket.off("reaction", this._onReaction);
    this._onExistingPeers = null;
    this._onPeerJoined = null;
    this._onPeerLeft = null;
    this._onSignal = null;
    this._onParticipantUpdated = null;
    this._onScreenShareState = null;
    this._onHostControl = null;
    this._onReaction = null;
  }

  private cleanupPeer(peerId: string) {
    const timer = this.offerTimers.get(peerId);
    if (timer) clearTimeout(timer);
    this.offerTimers.delete(peerId);
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.connection.close();
      this.peers.delete(peerId);
    }
    this.pendingCandidates.delete(peerId);
    this.makingOffer.delete(peerId);
    this.ignoreOffer.delete(peerId);
  }

  private async ensurePeerConnection(
    peerId: string,
    displayName: string,
    isHost: boolean,
    initialStatus: {
      isMuted: boolean; isCameraOff: boolean;
      isMicLocked: boolean; isCameraLocked: boolean;
    }
  ): Promise<RTCPeerConnection> {
    if (this.peers.has(peerId)) {
      return this.peers.get(peerId)!.connection;
    }

    this.pendingCandidates.set(peerId, []);
    this.makingOffer.set(peerId, false);
    this.ignoreOffer.set(peerId, false);

    const pc = new RTCPeerConnection(ICE_SERVERS);

    
    const audioTransceiver = pc.addTransceiver("audio", { direction: "sendrecv" });
    const videoTransceiver = pc.addTransceiver("video", { direction: "sendrecv" });

    const audioSender = audioTransceiver.sender;
    const videoSender = videoTransceiver.sender;

    
    const audioTrack = this.localStream?.getAudioTracks()[0] ?? null;
    const videoTrack = this.localStream?.getVideoTracks()[0] ?? null;
    if (audioTrack) await audioSender.replaceTrack(audioTrack).catch(() => {});
    if (videoTrack) await videoSender.replaceTrack(videoTrack).catch(() => {});

    pc.ontrack = (event) => {
      if (this.destroyed) return;
      const peer = this.peers.get(peerId);
      if (!peer) return;
      const track = event.track;

      if (!peer.stream) {
        peer.stream = new MediaStream();
      }

      
      const existing = peer.stream.getTracks().find((t) => t.kind === track.kind);
      if (existing) peer.stream.removeTrack(existing);
      peer.stream.addTrack(track);
      if (track.kind === "video") {
        peer.isCameraOff = false;
      }
      if (track.kind === "audio") {
        peer.isMuted = false;
      }
      this.onPeersChanged();

      track.addEventListener("unmute", () => {
        if (this.destroyed) return;
        const p2 = this.peers.get(peerId);
        if (p2) {
          if (track.kind === "video") p2.isCameraOff = false;
          if (track.kind === "audio") p2.isMuted = false;
        }
        this.onPeersChanged();
      });
      track.addEventListener("mute", () => {
        if (this.destroyed) return;
        const p2 = this.peers.get(peerId);
        if (p2) {
          if (track.kind === "video") p2.isCameraOff = true;
          if (track.kind === "audio") p2.isMuted = true;
        }
        this.onPeersChanged();
      });
      track.addEventListener("ended", () => {
        if (this.destroyed) return;
        const p2 = this.peers.get(peerId);
        if (p2?.stream) {
          p2.stream.removeTrack(track);
          if (track.kind === "video") p2.isCameraOff = true;
          if (track.kind === "audio") p2.isMuted = true;
          this.onPeersChanged();
        }
      });
    };

    pc.onicecandidate = (event) => {
      if (this.destroyed) return;
      if (event.candidate) {
        this.sendSignalToPeer(peerId, "ice-candidate", { candidate: event.candidate.toJSON() });
      }
    };

    pc.onconnectionstatechange = () => {
      if (this.destroyed) return;
      console.log(`[WebRTC] ${peerId} connectionState: ${pc.connectionState}`);
      if (pc.connectionState === "failed") {
        console.warn(`[WebRTC] Connection failed for ${peerId}, restarting ICE`);
        pc.restartIce();
      }
      if (pc.connectionState === "closed") {
        this.cleanupPeer(peerId);
        this.onPeersChanged();
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (this.destroyed) return;
      console.log(`[WebRTC] ${peerId} iceConnectionState: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === "failed") {
        pc.restartIce();
      }
    };

    pc.onsignalingstatechange = () => {
      if (this.destroyed) return;
      console.log(`[WebRTC] ${peerId} signalingState: ${pc.signalingState}`);
    };

    this.peers.set(peerId, {
      peerId,
      displayName,
      isHost,
      connection: pc,
      stream: null,
      isMuted: initialStatus.isMuted,
      isCameraOff: initialStatus.isCameraOff,
      isMicLocked: initialStatus.isMicLocked,
      isCameraLocked: initialStatus.isCameraLocked,
      isScreenSharing: false,
      signalQuality: "unknown",
      audioSender,
      videoSender,
    });

    this.onPeersChanged();
    return pc;
  }

  private async createAndSendOffer(peerId: string) {
    if (this.destroyed) return;
    const peer = this.peers.get(peerId);
    if (!peer) return;
    const pc = peer.connection;

    if (this.makingOffer.get(peerId)) return;
    if (pc.signalingState !== "stable") return;

    try {
      this.makingOffer.set(peerId, true);

      const offer = await pc.createOffer();
      if (pc.signalingState !== "stable") {
        this.makingOffer.set(peerId, false);
        return;
      }
      await pc.setLocalDescription(offer);
      this.sendSignalToPeer(peerId, "offer", { offer: pc.localDescription });
    } catch (err) {
      console.error("[WebRTC] createAndSendOffer error:", err);
    } finally {
      this.makingOffer.set(peerId, false);
    }
  }

  private async flushPendingCandidates(peerId: string) {
    const pc = this.peers.get(peerId)?.connection;
    if (!pc || !pc.remoteDescription) return;
    const candidates = this.pendingCandidates.get(peerId) ?? [];
    this.pendingCandidates.set(peerId, []);
    for (const c of candidates) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(c));
      } catch (err) {
        console.warn("[WebRTC] addIceCandidate failed:", err);
      }
    }
  }

  private async handleSignal(fromPeer: string, type: string, payload: object) {
    if (this.destroyed) return;

    const p = payload as {
      offer?: RTCSessionDescriptionInit;
      answer?: RTCSessionDescriptionInit;
      candidate?: RTCIceCandidateInit;
    };

    if (type === "offer") {
      if (!this.peers.has(fromPeer)) {
        await this.ensurePeerConnection(fromPeer, "Guest", false, {
          isMuted: true, isCameraOff: true, isMicLocked: false, isCameraLocked: false,
        });
      }
      const peer = this.peers.get(fromPeer);
      if (!peer) return;
      const pc = peer.connection;

      
      const isPolite = this.localPeerId > fromPeer;
      const offerCollision = this.makingOffer.get(fromPeer) || pc.signalingState !== "stable";

      if (!isPolite && offerCollision) {
        console.warn("[WebRTC] Ignoring colliding offer (impolite peer)");
        return;
      }

      try {
        if (offerCollision) {
          
          await pc.setLocalDescription({ type: "rollback" });
          this.makingOffer.set(fromPeer, false);
        }

        await pc.setRemoteDescription(new RTCSessionDescription(p.offer!));
        await this.flushPendingCandidates(fromPeer);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.sendSignalToPeer(fromPeer, "answer", { answer: pc.localDescription });
      } catch (err) {
        console.error("[WebRTC] offer handling error:", err);
      }
      return;
    }

    if (type === "answer") {
      const peer = this.peers.get(fromPeer);
      if (!peer) return;
      const pc = peer.connection;
      if (pc.signalingState !== "have-local-offer") {
        console.warn(`[WebRTC] Ignoring answer in state ${pc.signalingState}`);
        return;
      }
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(p.answer!));
        await this.flushPendingCandidates(fromPeer);
      } catch (err) {
        console.error("[WebRTC] answer handling error:", err);
      }
      return;
    }

    if (type === "ice-candidate") {
      const pc = this.peers.get(fromPeer)?.connection;
      if (!pc || !p.candidate) return;

      if (!pc.remoteDescription) {
        const queue = this.pendingCandidates.get(fromPeer) ?? [];
        queue.push(p.candidate);
        this.pendingCandidates.set(fromPeer, queue);
      } else {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(p.candidate));
        } catch (err) {
          console.warn("[WebRTC] addIceCandidate error:", err);
        }
      }
      return;
    }
  }

  private startStatsPolling() {
    this.statsInterval = setInterval(async () => {
      if (this.destroyed) return;
      let changed = false;
      for (const peer of this.peers.values()) {
        try {
          const stats = await peer.connection.getStats();
          let rtt: number | undefined;
          stats.forEach((r) => {
            if (r.type === "candidate-pair" && r.state === "succeeded" && r.currentRoundTripTime !== undefined) {
              rtt = r.currentRoundTripTime * 1000;
            }
          });
          const quality = rttToQuality(rtt);
          if (peer.signalQuality !== quality) {
            peer.signalQuality = quality;
            changed = true;
          }
        } catch {}
      }
      if (changed) this.onPeersChanged();
    }, 3000);
  }

  private sendSignalToPeer(toPeer: string, type: string, payload: object) {
    if (this.destroyed) return;
    this.socket.emit("signal", {
      roomCode: this.roomCode,
      fromPeer: this.localPeerId,
      toPeer,
      type,
      payload,
    });
  }

  async sendSignal(type: string, payload: object) {
    if (this.destroyed) return;
    this.socket.emit("broadcast", {
      roomCode: this.roomCode,
      fromPeer: this.localPeerId,
      type,
      payload,
    });
  }

  broadcastScreenShareState(isSharing: boolean) {
    this.socket.emit("broadcast", {
      roomCode: this.roomCode,
      fromPeer: this.localPeerId,
      type: "screen-share-state",
      payload: { isSharing },
    });
  }

  async updateParticipantStatus(isMuted: boolean, isCameraOff: boolean) {
    if (this.destroyed) return;
    this.socket.emit("participant-status", {
      roomCode: this.roomCode,
      peerId: this.localPeerId,
      isMuted,
      isCameraOff,
    });
  }

  async hostControlParticipant(
    targetPeerId: string,
    action: "mute" | "unmute" | "lock-mic" | "unlock-mic" | "lock-camera" | "unlock-camera",
    value: boolean
  ) {
    this.socket.emit("host-control", {
      roomCode: this.roomCode,
      fromPeer: this.localPeerId,
      targetPeer: targetPeerId,
      action,
      value,
    });
  }

  onHostControl(handler: SignalHandler) {
    this.onSignal = handler;
  }

  getPeers(): PeerConnection[] {
    return Array.from(this.peers.values());
  }

  updateLocalStream(newStream: MediaStream) {
    this.localStream = newStream;
  }

  async replaceAudioTrack(newTrack: MediaStreamTrack | null) {
    if (this.destroyed) return;

    const shouldRenegotiate = Array.from(this.peers.values()).some((peer) => {
      const hadTrack = !!peer.audioSender.track;
      return hadTrack !== !!newTrack;
    });

    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((t) => this.localStream!.removeTrack(t));
      if (newTrack) this.localStream.addTrack(newTrack);
    }
    const replacements = Array.from(this.peers.values()).map((peer) =>
      peer.audioSender.replaceTrack(newTrack).catch((err) => {
        console.warn("[WebRTC] replaceAudioTrack error:", err);
      })
    );
    await Promise.all(replacements);

    if (shouldRenegotiate) {
      for (const peer of this.peers.values()) {
        if (peer.connection.signalingState === "stable") {
          await this.createAndSendOffer(peer.peerId);
        }
      }
    }
  }

  async replaceVideoTrack(newTrack: MediaStreamTrack | null) {
    if (this.destroyed) return;

    const shouldRenegotiate = Array.from(this.peers.values()).some((peer) => {
      const hadTrack = !!peer.videoSender.track;
      return hadTrack !== !!newTrack;
    });

    if (this.localStream) {
      this.localStream.getVideoTracks().forEach((t) => this.localStream!.removeTrack(t));
      if (newTrack) this.localStream.addTrack(newTrack);
    }
    const replacements = Array.from(this.peers.values()).map((peer) =>
      peer.videoSender.replaceTrack(newTrack).catch((err) => {
        console.warn("[WebRTC] replaceVideoTrack error:", err);
      })
    );
    await Promise.all(replacements);

    if (shouldRenegotiate) {
      for (const peer of this.peers.values()) {
        if (peer.connection.signalingState === "stable") {
          await this.createAndSendOffer(peer.peerId);
        }
      }
    }
  }

  async leave() {
    if (this.destroyed) return;
    this.destroyed = true;

    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
    this.offerTimers.forEach((t) => clearTimeout(t));
    this.offerTimers.clear();

    
    this.removeSocketListeners();

    this.socket.emit("leave-room", {
      roomCode: this.roomCode,
      peerId: this.localPeerId,
    });

    this.peers.forEach((peer) => peer.connection.close());
    this.peers.clear();
    this.pendingCandidates.clear();
    this.makingOffer.clear();
    this.ignoreOffer.clear();
  }
}
