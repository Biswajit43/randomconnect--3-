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
  const peersRef = useRef(new Map()); // socketId -> RTCPeerConnection
  const roomIdRef = useRef(null);

  const createPeer = useCallback(
    (peerId) => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          socket.emit("group:webrtc-ice-candidate", { targetId: peerId, candidate: e.candidate });
        }
      };

      pc.ontrack = (e) => {
        setRemoteStreams((prev) => ({ ...prev, [peerId]: e.streams[0] }));
      };

      pc.onconnectionstatechange = () => {
        if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
          removePeer(peerId);
        }
      };

      localStream?.getTracks().forEach((track) => pc.addTrack(track, localStream));
      peersRef.current.set(peerId, pc);
      return pc;
    },
    [localStream]
  );

  const removePeer = useCallback((peerId) => {
    peersRef.current.get(peerId)?.close();
    peersRef.current.delete(peerId);
    setRemoteStreams((prev) => {
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
  }, []);

  // Called for each peer already in the room when we join — we initiate.
  const connectToExistingPeer = useCallback(
    async (peerId) => {
      const pc = createPeer(peerId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("group:webrtc-offer", { roomId: roomIdRef.current, targetId: peerId, sdp: offer });
    },
    [createPeer]
  );

  const setRoomId = useCallback((roomId) => {
    roomIdRef.current = roomId;
  }, []);

  const closeAll = useCallback(() => {
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
    setRemoteStreams({});
  }, []);

  /**
   * Adds a video track (camera turned on after joining audio-only — see
   * GroupRoom) to every existing mesh connection and renegotiates each one
   * individually. New peers who join later pick it up automatically via
   * createPeer(), since it reads tracks off the same localStream object.
   */
  const addVideoTrackToAllPeers = useCallback(async (track, stream) => {
    for (const [peerId, pc] of peersRef.current.entries()) {
      pc.addTrack(track, stream);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("group:webrtc-offer", { roomId: roomIdRef.current, targetId: peerId, sdp: offer });
    }
  }, []);

  useEffect(() => {
    async function onOffer({ fromId, sdp }) {
      // Reuse the existing connection if one's already open — this is what
      // makes renegotiation (e.g. adding a video track after the call has
      // started) work instead of silently replacing an established peer.
      const pc = peersRef.current.get(fromId) || createPeer(fromId);
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("group:webrtc-answer", { targetId: fromId, sdp: answer });
    }

    async function onAnswer({ fromId, sdp }) {
      const pc = peersRef.current.get(fromId);
      if (pc) await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    }

    async function onIceCandidate({ fromId, candidate }) {
      const pc = peersRef.current.get(fromId);
      if (pc && candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.warn("addIceCandidate failed", err);
        }
      }
    }

    function onPeerLeft({ socketId }) {
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

  return { remoteStreams, connectToExistingPeer, removePeer, setRoomId, closeAll, addVideoTrackToAllPeers };
}
