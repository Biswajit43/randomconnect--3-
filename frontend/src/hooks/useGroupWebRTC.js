import { useCallback, useEffect, useRef, useState } from "react";
import { socket } from "../lib/socket.js";
import { buildIceServers } from "../lib/iceServers.js";

// Group calls need TURN even more than 1-to-1 — every participant needs a
// working path to every other one. See lib/iceServers.js.
const ICE_SERVERS = buildIceServers();

/**
 * Manages one RTCPeerConnection per remote participant (full mesh). Keys
 * everything by socketId so peers can be added/removed as people join/leave
 * without disturbing existing connections.
 */
export function useGroupWebRTC({ localStream }) {
  const [remoteStreams, setRemoteStreams] = useState({}); // socketId -> MediaStream
  const [connectionStates, setConnectionStates] = useState({});

  const peersRef = useRef(new Map()); // socketId -> RTCPeerConnection
  const negotiatingRef = useRef(new Set());
  const pendingIceRef = useRef(new Map());
  const reconnectTimersRef = useRef(new Map());
  const recoveryAttemptsRef = useRef(new Map());
  const recoverPeerRef = useRef(() => {});
  const localStreamRef = useRef(localStream);
  const roomIdRef = useRef(null);

  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  const createPeer = useCallback(
    (peerId) => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS, iceCandidatePoolSize: 10 });

      const scheduleRecovery = () => {
        if (!socket.connected || reconnectTimersRef.current.has(peerId)) return;
        const attempts = recoveryAttemptsRef.current.get(peerId) || 0;
        if (attempts >= 6) return;
        recoveryAttemptsRef.current.set(peerId, attempts + 1);
        const delay = Math.min(6000, 500 * (2 ** attempts));
        const timer = window.setTimeout(() => {
          reconnectTimersRef.current.delete(peerId);
          recoverPeerRef.current(peerId);
        }, delay);
        reconnectTimersRef.current.set(peerId, timer);
      };

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          socket.emit("group:webrtc-ice-candidate", { roomId: roomIdRef.current, targetId: peerId, candidate: e.candidate });
        }
      };

      pc.ontrack = (e) => {
        setRemoteStreams((prev) => {
          const incoming = e.streams?.[0] || prev[peerId] || new MediaStream();
          e.track.enabled = true;
          if (!incoming.getTracks().includes(e.track)) incoming.addTrack(e.track);
          return { ...prev, [peerId]: incoming };
        });
      };

      pc.onconnectionstatechange = () => {
        setConnectionStates((current) => ({ ...current, [peerId]: pc.connectionState }));
        if (["connected", "completed"].includes(pc.connectionState)) recoveryAttemptsRef.current.delete(peerId);
        if (["failed", "disconnected"].includes(pc.connectionState) && socket.id && socket.id < peerId) scheduleRecovery();
        if (pc.connectionState === "closed") {
          removePeer(peerId);
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (["failed", "disconnected"].includes(pc.iceConnectionState) && socket.id && socket.id < peerId) scheduleRecovery();
      };

      // --- FIXED AUDIO PRIORITY HERE ---
      localStreamRef.current?.getTracks().forEach((track) => {
        const sender = pc.addTrack(track, localStreamRef.current);
        
        // Force WebRTC to prioritize Audio over Video to prevent robotic voices
        try {
          const parameters = sender.getParameters();
          if (!parameters.encodings) parameters.encodings = [{}];
          
          if (track.kind === "audio") {
            parameters.encodings[0].networkPriority = "high";
          } else if (track.kind === "video") {
            parameters.encodings[0].networkPriority = "low";
            parameters.encodings[0].maxBitrate = 150000; // Cap video to save bandwidth
          }
          
          sender.setParameters(parameters);
        } catch (error) {
          console.warn("Could not set track priority", error);
        }
      });

      peersRef.current.set(peerId, pc);
      return pc;
    },
    []
  );

  const removePeer = useCallback((peerId) => {
    peersRef.current.get(peerId)?.close();
    peersRef.current.delete(peerId);
    pendingIceRef.current.delete(peerId);
    setRemoteStreams((prev) => {
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
    negotiatingRef.current.delete(peerId);
    setConnectionStates((current) => {
      const next = { ...current };
      delete next[peerId];
      return next;
    });
  }, []);

  const connectToExistingPeer = useCallback(
    async (peerId) => {
      if (!socket.connected || negotiatingRef.current.has(peerId)) return;
      const pc = peersRef.current.get(peerId) || createPeer(peerId);
      if (pc.signalingState === "closed" || pc.signalingState !== "stable") return;
      negotiatingRef.current.add(peerId);
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("group:webrtc-offer", { roomId: roomIdRef.current, targetId: peerId, sdp: offer });
      } finally {
        negotiatingRef.current.delete(peerId);
      }
    },
    [createPeer]
  );

  const recoverPeer = useCallback(async (peerId) => {
    removePeer(peerId);
    try {
      await connectToExistingPeer(peerId);
    } catch (error) {
      console.warn("peer audio recovery failed", error);
    }
  }, [connectToExistingPeer, removePeer]);

  useEffect(() => {
    recoverPeerRef.current = recoverPeer;
  }, [recoverPeer]);

  const setRoomId = useCallback((roomId) => {
    roomIdRef.current = roomId;
  }, []);

  const closeAll = useCallback(() => {
    reconnectTimersRef.current.forEach((timer) => clearTimeout(timer));
    reconnectTimersRef.current.clear();
    recoveryAttemptsRef.current.clear();
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
    pendingIceRef.current.clear();
    setRemoteStreams({});
    setConnectionStates({});
    negotiatingRef.current.clear();
  }, []);

  const addTrackToAllPeers = useCallback(async (track, stream) => {
    for (const [peerId, pc] of peersRef.current.entries()) {
      pc.addTrack(track, stream);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("group:webrtc-offer", { roomId: roomIdRef.current, targetId: peerId, sdp: offer });
    }
  }, []);

  const addVideoTrackToAllPeers = useCallback(async (track, stream) => {
    await addTrackToAllPeers(track, stream);
  }, [addTrackToAllPeers]);

  const removeTrackFromAllPeers = useCallback(async (track) => {
    for (const [peerId, pc] of peersRef.current.entries()) {
      const sender = pc.getSenders().find((item) => item.track === track);
      if (!sender) continue;
      pc.removeTrack(sender);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("group:webrtc-offer", { roomId: roomIdRef.current, targetId: peerId, sdp: offer });
    }
  }, []);

  const replaceVideoTrackForAllPeers = useCallback(async (track) => {
    for (const pc of peersRef.current.values()) {
      const sender = pc.getSenders().find((item) => item.track?.kind === "video");
      if (sender) await sender.replaceTrack(track);
    }
  }, []);

  const syncLocalTracks = useCallback(async () => {
    if (!localStream) return;
    for (const [peerId, pc] of peersRef.current.entries()) {
      if (pc.signalingState === "closed") continue;
      const senderKinds = new Set(pc.getSenders().map((sender) => sender.track?.kind).filter(Boolean));
      const missingTracks = localStream.getTracks().filter((track) => !senderKinds.has(track.kind));
      if (!missingTracks.length) continue;
      missingTracks.forEach((track) => pc.addTrack(track, localStream));
      if (pc.signalingState !== "stable" || negotiatingRef.current.has(peerId)) continue;
      negotiatingRef.current.add(peerId);
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("group:webrtc-offer", { roomId: roomIdRef.current, targetId: peerId, sdp: offer });
      } catch (error) {
        console.warn("local track renegotiation failed", error);
      } finally {
        negotiatingRef.current.delete(peerId);
      }
    }
  }, [localStream]);

  useEffect(() => {
    syncLocalTracks();
  }, [syncLocalTracks]);

  useEffect(() => {
    async function onOffer({ roomId, fromId, sdp }) {
      try {
        let pc = peersRef.current.get(fromId) || createPeer(fromId);
        if (["failed", "closed"].includes(pc.connectionState)) {
          removePeer(fromId);
          pc = createPeer(fromId);
        }
        if (pc.signalingState === "have-local-offer") await pc.setLocalDescription({ type: "rollback" });
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const pending = pendingIceRef.current.get(fromId) || [];
        for (const candidate of pending) await pc.addIceCandidate(new RTCIceCandidate(candidate));
        pendingIceRef.current.delete(fromId);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("group:webrtc-answer", { roomId, targetId: fromId, sdp: answer });
      } catch (error) {
        console.warn("group offer negotiation failed", error);
      }
    }

    async function onAnswer({ fromId, sdp }) {
      const pc = peersRef.current.get(fromId);
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          const pending = pendingIceRef.current.get(fromId) || [];
          for (const candidate of pending) await pc.addIceCandidate(new RTCIceCandidate(candidate));
          pendingIceRef.current.delete(fromId);
        } catch (error) {
          console.warn("setRemoteDescription(answer) failed", error);
        }
      }
    }

    async function onIceCandidate({ fromId, candidate }) {
      const pc = peersRef.current.get(fromId);
      if (candidate) {
        try {
          if (!pc || !pc.remoteDescription) {
            const pending = pendingIceRef.current.get(fromId) || [];
            pending.push(candidate);
            pendingIceRef.current.set(fromId, pending);
          } else {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          }
        } catch (err) {
          console.warn("addIceCandidate failed", err);
        }
      }
    }

    function onPeerLeft({ socketId }) {
      const timer = reconnectTimersRef.current.get(socketId);
      if (timer) clearTimeout(timer);
      reconnectTimersRef.current.delete(socketId);
      removePeer(socketId);
    }

    socket.on("group:webrtc-offer", onOffer);
    socket.on("group:webrtc-answer", onAnswer);
    socket.on("group:webrtc-ice-candidate", onIceCandidate);
    socket.on("group:peer-left", onPeerLeft);

    return () => {
      socket.off("group:webrtc-offer", onOffer);
      socket.off("group:webrtc-answer", onAnswer);
      socket.off("group:webrtc-ice-candidate", onIceCandidate);
      socket.off("group:peer-left", onPeerLeft);
    };
  }, [createPeer, removePeer]);

  return { remoteStreams, connectionStates, connectToExistingPeer, removePeer, setRoomId, closeAll, addVideoTrackToAllPeers, addTrackToAllPeers, removeTrackFromAllPeers, replaceVideoTrackForAllPeers };
}