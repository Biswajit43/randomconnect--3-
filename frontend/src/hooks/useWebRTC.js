import { useCallback, useEffect, useRef, useState } from "react";
import { socket } from "../lib/socket.js";
import { buildIceServers } from "../lib/iceServers.js";

const ICE_SERVERS = buildIceServers();

export function useWebRTC({ localStream }) {
  const [remoteStream, setRemoteStream] = useState(null);
  const [connectionState, setConnectionState] = useState("idle"); // idle | connecting | connected | failed
  const pcRef = useRef(null);
  const roomIdRef = useRef(null);

  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = (event) => {
      if (event.candidate && roomIdRef.current) {
        socket.emit("webrtc:ice-candidate", {
          roomId: roomIdRef.current,
          candidate: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0]);
    };

    pc.onconnectionstatechange = () => {
      setConnectionState(pc.connectionState);
    };

    if (localStream) {
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
    }

    return pc;
  }, [localStream]);

  const startCall = useCallback(
    async (roomId, isInitiator) => {
      roomIdRef.current = roomId;
      setConnectionState("connecting");
      const pc = createPeerConnection();
      pcRef.current = pc;

      if (isInitiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("webrtc:offer", { roomId, sdp: offer });
      }
    },
    [createPeerConnection]
  );

  const endCall = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    roomIdRef.current = null;
    setRemoteStream(null);
    setConnectionState("idle");
  }, []);

  /**
   * Adds a video track that wasn't present when the call started (camera
   * defaults to off — see Landing/ChatRoom). Renegotiates the existing
   * connection so the remote side starts receiving it without a full
   * reconnect. Safe regardless of who was the original offer-sender —
   * renegotiation offers work symmetrically on an already-established
   * connection.
   */
  const addVideoTrack = useCallback(async (track, stream) => {
    const pc = pcRef.current;
    if (!pc || !roomIdRef.current) return;
    pc.addTrack(track, stream);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("webrtc:offer", { roomId: roomIdRef.current, sdp: offer });
  }, []);

  useEffect(() => {
    async function onOffer({ sdp }) {
      const pc = pcRef.current;
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("webrtc:answer", { roomId: roomIdRef.current, sdp: answer });
    }

    async function onAnswer({ sdp }) {
      const pc = pcRef.current;
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    }

    async function onIceCandidate({ candidate }) {
      const pc = pcRef.current;
      if (!pc || !candidate) return;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn("addIceCandidate failed", err);
      }
    }

    socket.on("webrtc:offer", onOffer);
    socket.on("webrtc:answer", onAnswer);
    socket.on("webrtc:ice-candidate", onIceCandidate);

    return () => {
      socket.off("webrtc:offer", onOffer);
      socket.off("webrtc:answer", onAnswer);
      socket.off("webrtc:ice-candidate", onIceCandidate);
    };
  }, []);

  return { remoteStream, connectionState, startCall, endCall, addVideoTrack };
}
