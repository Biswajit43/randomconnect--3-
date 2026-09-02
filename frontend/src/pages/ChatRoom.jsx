import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { socket, getFingerprint, getDisplayName } from "../lib/socket.js";
import { useWebRTC } from "../hooks/useWebRTC.js";
import VideoTile from "../components/VideoTile.jsx";
import Controls from "../components/Controls.jsx";
import ChatPanel from "../components/ChatPanel.jsx";
import ReportModal from "../components/ReportModal.jsx";
import PulseConnector from "../components/PulseConnector.jsx";

export default function ChatRoom() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const interests = state?.interests || [];

  const [localStream, setLocalStream] = useState(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(false);
  const [phase, setPhase] = useState("connecting-media"); // connecting-media | queued | matched | blocked
  const [queuePosition, setQueuePosition] = useState(null);
  const [partnerName, setPartnerName] = useState("Stranger");
  const [roomId, setRoomId] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [blockedReason, setBlockedReason] = useState(null);

  const { remoteStream, connectionState, startCall, endCall, addVideoTrack } = useWebRTC({ localStream });
  const mediaRequested = useRef(false);
  const localStreamRef = useRef(null); // mirrors localStream for use in cleanup, which otherwise closes over a stale null

  // Someone can land here directly (bookmark, back button) without going
  // through the name/age gate on Landing — send them back if so.
  useEffect(() => {
    if (!getDisplayName()) navigate("/");
  }, [navigate]);

  // 1. Get mic only (camera stays off until the user explicitly turns it on
  // — see toggleCam), then connect the socket and identify.
  useEffect(() => {
    if (mediaRequested.current) return;
    mediaRequested.current = true;

    navigator.mediaDevices
      .getUserMedia({ video: false, audio: true })
      .then((stream) => {
        localStreamRef.current = stream;
        setLocalStream(stream);
        socket.connect();
        socket.emit("identify", { fingerprint: getFingerprint(), displayName: getDisplayName(), ageConfirmed: true });
      })
      .catch(() => {
        setPhase("blocked");
        setBlockedReason("camera_mic_denied");
      });

    return () => {
      // Read from the ref, not the `localStream` state variable — this
      // effect only runs once (empty deps), so its closure over `localStream`
      // is permanently the initial `null`, and the tracks would never
      // actually get released without this. Leaving them running is what
      // causes "device already in use" errors the next time you join.
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const joinQueue = useCallback(() => {
    setPhase("queued");
    socket.emit("queue:join", { interests });
  }, [interests]);

  useEffect(() => {
    function onIdentified() {
      joinQueue();
    }
    function onMatchFound({ roomId, initiator, partnerDisplayName }) {
      setRoomId(roomId);
      setPartnerName(partnerDisplayName || "Stranger");
      setPhase("matched");
      startCall(roomId, initiator);
    }
    function onPartnerLeft() {
      endCall();
      setRoomId(null);
      setPartnerName("Stranger");
      setPhase("queued");
      socket.emit("queue:join", { interests });
    }
    function onBlocked({ reason }) {
      setPhase("blocked");
      setBlockedReason(reason);
    }
    function onReported() {
      // handled by onPartnerLeft-equivalent flow server-side (session:report ends room)
    }
    function onReportFailed({ message }) {
      alert(message || "Couldn't file the report — please try again.");
    }
    function onQueueWaiting({ position }) {
      setQueuePosition(position ?? null);
    }

    socket.on("identified", onIdentified);
    socket.on("match:found", onMatchFound);
    socket.on("partner:left", onPartnerLeft);
    socket.on("blocked", onBlocked);
    socket.on("session:reported", onReported);
    socket.on("session:report-failed", onReportFailed);
    socket.on("queue:waiting", onQueueWaiting);

    return () => {
      socket.off("identified", onIdentified);
      socket.off("match:found", onMatchFound);
      socket.off("partner:left", onPartnerLeft);
      socket.off("blocked", onBlocked);
      socket.off("session:reported", onReported);
      socket.off("session:report-failed", onReportFailed);
      socket.off("queue:waiting", onQueueWaiting);
    };
  }, [joinQueue, endCall, interests]);

  function toggleMic() {
    localStream?.getAudioTracks().forEach((t) => (t.enabled = !t.enabled));
    setMicOn((v) => !v);
  }
  async function toggleCam() {
    const existingVideoTracks = localStream?.getVideoTracks() || [];
    if (existingVideoTracks.length === 0) {
      // First time enabling — camera was never requested at join, by design.
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const track = videoStream.getVideoTracks()[0];
        localStream.addTrack(track);
        if (phase === "matched") await addVideoTrack(track, localStream);
        setCamOn(true);
      } catch {
        alert("Camera access was denied or unavailable.");
      }
      return;
    }
    const next = !camOn;
    existingVideoTracks.forEach((t) => (t.enabled = next));
    setCamOn(next);
  }
  function skip() {
    endCall();
    socket.emit("session:skip");
    setRoomId(null);
    setPartnerName("Stranger");
    setPhase("queued");
    socket.emit("queue:join", { interests });
  }
  function stop() {
    endCall();
    socket.disconnect();
    navigate("/");
  }
  function submitReport({ reason, details }) {
    socket.emit("session:report", { roomId, reason, details });
    setReportOpen(false);
    endCall();
    setRoomId(null);
    setPhase("queued");
  }

  if (phase === "blocked") {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center">
        <div>
          <h2 className="font-display text-2xl text-white mb-2">Can't start a call</h2>
          <p className="text-mist max-w-sm">
            {blockedReason === "camera_mic_denied" &&
              "Camera and microphone access is required for video chat. Check your browser permissions and try again."}
            {blockedReason === "banned" && "This device is currently restricted from using RandomConnect."}
            {blockedReason === "age_confirmation_required" && "You must confirm you're 18+ to continue."}
            {blockedReason === "server_error" && "Something went wrong on our end. Please try again in a moment."}
          </p>
          <button onClick={() => navigate("/")} className="mt-6 px-5 py-2.5 rounded-lg bg-signal text-ink font-semibold">
            Back home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col px-4 md:px-8 py-4">
      <header className="flex items-center justify-between mb-4">
        <span className="font-display font-bold text-white">
          random<span className="text-signal">connect</span>
        </span>
        <StatusPill phase={phase} connectionState={connectionState} />
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 min-h-0">
        <div className="flex flex-col gap-4 min-h-0">
          {phase === "matched" ? (
            <div className="grid grid-cols-2 gap-4 flex-1">
              <VideoTile stream={remoteStream} label={partnerName} />
              <VideoTile stream={localStream} muted mirrored label={`You (${getDisplayName() || "Guest"})`} />
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-panel/40 rounded-2xl border border-white/5">
              <PulseConnector
                label={
                  phase === "queued"
                    ? queuePosition && queuePosition > 1
                      ? `Looking for someone… ${queuePosition - 1} ${queuePosition - 1 === 1 ? "person" : "people"} ahead of you`
                      : "Looking for someone to connect you with…"
                    : "Getting your mic ready…"
                }
              />
            </div>
          )}

          <Controls
            micOn={micOn}
            camOn={camOn}
            onToggleMic={toggleMic}
            onToggleCam={toggleCam}
            onSkip={skip}
            onStop={stop}
            onReport={() => setReportOpen(true)}
          />
        </div>

        <div className="hidden lg:block min-h-0">
          <ChatPanel roomId={roomId} partnerName={partnerName} />
        </div>
      </div>

      <ReportModal open={reportOpen} onClose={() => setReportOpen(false)} onSubmit={submitReport} />
    </div>
  );
}

function StatusPill({ phase, connectionState }) {
  const label =
    phase === "matched"
      ? connectionState === "connected"
        ? "Connected"
        : "Connecting…"
      : phase === "queued"
      ? "Searching…"
      : "Starting…";

  const color = phase === "matched" && connectionState === "connected" ? "bg-signal" : "bg-violet";

  return (
    <span className="flex items-center gap-2 text-xs font-mono text-mist">
      <span className={`w-2 h-2 rounded-full ${color} animate-pulse`} />
      {label}
    </span>
  );
}
