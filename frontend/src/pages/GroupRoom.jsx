import { useEffect, useRef, useState } from "react";
import { useLocation, useParams, useNavigate } from "react-router-dom";
import { socket, getFingerprint, getDisplayName } from "../lib/socket.js";
import { api } from "../lib/api.js";
import { useGroupWebRTC } from "../hooks/useGroupWebRTC.js";
import VideoTile from "../components/VideoTile.jsx";
import ReportModal from "../components/ReportModal.jsx";

export default function GroupRoom() {
  const { roomId } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();

  const [room, setRoom] = useState(state?.room || null);
  const [localStream, setLocalStream] = useState(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(false); // camera stays off until the user turns it on
  const [peers, setPeers] = useState([]); // [{socketId, displayName, isModerator}]
  const [phase, setPhase] = useState("connecting-media"); // connecting-media | joined | waiting | blocked
  const [isModerator, setIsModerator] = useState(false);
  const [waitingList, setWaitingList] = useState([]);
  const [mutedPeers, setMutedPeers] = useState(() => new Set());
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [reportTarget, setReportTarget] = useState(null);
  const [banner, setBanner] = useState(null); // transient notice, e.g. "You were muted by the host"
  const [forceMuted, setForceMuted] = useState(false); // true while a moderator has muted this device
  const chatScrollRef = useRef(null);
  const displayName = useRef(getDisplayName() || `Guest-${getFingerprint().slice(0, 4)}`);
  const mediaRequested = useRef(false);
  const localStreamRef = useRef(null); // mirrors localStream for cleanup — see note below

  // Someone can land here directly (bookmark, shared link, back button)
  // without going through the name/age gate on Landing — send them there,
  // but remember where they were headed so Landing can send them right back
  // instead of dropping them at the general rooms list.
  useEffect(() => {
    if (!getDisplayName()) navigate("/", { state: { returnTo: `/rooms/${roomId}` } });
  }, [navigate, roomId]);

  const { remoteStreams, connectToExistingPeer, setRoomId, closeAll, addVideoTrackToAllPeers } =
    useGroupWebRTC({ localStream });

  useEffect(() => {
    if (!room) api.getRoom(roomId).then(setRoom).catch(() => {});
  }, [roomId, room]);

  useEffect(() => {
    setRoomId(roomId);
  }, [roomId, setRoomId]);

  function showBanner(text) {
    setBanner(text);
    setTimeout(() => setBanner((b) => (b === text ? null : b)), 4000);
  }

  // 1. Get mic only — camera defaults to off regardless of room mode, the
  // user opts in explicitly. See toggleCam.
  useEffect(() => {
    if (mediaRequested.current) return;
    mediaRequested.current = true;

    navigator.mediaDevices
      .getUserMedia({ video: false, audio: true })
      .then((stream) => {
        localStreamRef.current = stream;
        setLocalStream(stream);
        socket.connect();
        socket.emit("identify", { fingerprint: getFingerprint(), ageConfirmed: true });
      })
      .catch(() => setPhase("blocked"));

    return () => {
      // Read from the ref, not the `localStream` state variable — this
      // effect only runs once (empty deps), so its closure over `localStream`
      // is permanently the initial `null` and the tracks would never
      // actually stop without this, leaving the mic/camera running and
      // causing "device already in use" errors the next time you join.
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      closeAll();
      socket.emit("group:leave", { roomId });
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onIdentified() {
      socket.emit("group:join", { roomId, displayName: displayName.current });
    }
    function onJoined({ existingPeers, isModerator: mod }) {
      setPhase("joined");
      setPeers(existingPeers);
      setIsModerator(mod);
      setMutedPeers(new Set(existingPeers.filter((p) => p.isMuted).map((p) => p.socketId)));
      existingPeers.forEach((p) => connectToExistingPeer(p.socketId));
    }
    function onPeerJoined({ socketId, displayName: name, isModerator: mod }) {
      setPeers((prev) => [...prev, { socketId, displayName: name, isModerator: mod }]);
    }
    function onPeerLeft({ socketId }) {
      setPeers((prev) => prev.filter((p) => p.socketId !== socketId));
    }
    function onPeerPromoted({ socketId }) {
      setPeers((prev) => prev.map((p) => (p.socketId === socketId ? { ...p, isModerator: true } : p)));
    }
    function onChatMessage(msg) {
      setMessages((prev) => [...prev, msg]);
    }
    function onBlocked() {
      setPhase("blocked");
    }
    function onForceMute() {
      localStream?.getAudioTracks().forEach((t) => (t.enabled = false));
      setMicOn(false);
      setForceMuted(true);
      showBanner("The host muted your mic.");
    }
    function onForceUnmute() {
      // Deliberately does NOT re-enable the mic track automatically — a
      // moderator lifting a mute shouldn't mean the server can switch
      // someone's microphone back on without their say-so. It just lifts
      // the restriction; the person still has to choose to unmute.
      setForceMuted(false);
      showBanner("The host lifted your mute — turn your mic back on whenever you're ready.");
    }
    function onMovedToWaiting() {
      closeAll();
      setPeers([]);
      setPhase("waiting");
    }
    function onAdmitted() {
      setPeers([]);
      setMutedPeers(new Set());
      setForceMuted(false);
      setPhase("connecting-media");
      socket.emit("group:join", { roomId, displayName: displayName.current });
    }
    function onRemoved({ reason }) {
      alert(reason || "You were removed from this room.");
      navigate("/rooms");
    }
    function onPromoted() {
      setIsModerator(true);
      showBanner("You're now a moderator of this room.");
    }
    function onWaitingList({ waiting }) {
      setWaitingList(waiting);
    }
    // Defensive mute: even if the muted person's own client ignores
    // group:force-mute, everyone else stops playing their incoming audio
    // locally the moment the moderator acts (see the effect below that
    // applies mutedPeers to the actual MediaStreamTrack).
    function onPeerMuted({ socketId }) {
      setMutedPeers((prev) => new Set(prev).add(socketId));
    }
    function onPeerUnmuted({ socketId }) {
      setMutedPeers((prev) => {
        const next = new Set(prev);
        next.delete(socketId);
        return next;
      });
    }
    function onReportFailed({ message }) {
      alert(message || "Couldn't file the report — please try again.");
    }

    socket.on("identified", onIdentified);
    socket.on("group:joined", onJoined);
    socket.on("group:peer-joined", onPeerJoined);
    socket.on("group:peer-left", onPeerLeft);
    socket.on("group:peer-promoted", onPeerPromoted);
    socket.on("group:chat-message", onChatMessage);
    socket.on("blocked", onBlocked);
    socket.on("group:force-mute", onForceMute);
    socket.on("group:force-unmute", onForceUnmute);
    socket.on("group:moved-to-waiting", onMovedToWaiting);
    socket.on("group:admitted", onAdmitted);
    socket.on("group:removed", onRemoved);
    socket.on("group:promoted", onPromoted);
    socket.on("group:waiting-list", onWaitingList);
    socket.on("group:peer-muted", onPeerMuted);
    socket.on("group:peer-unmuted", onPeerUnmuted);
    socket.on("group:report-failed", onReportFailed);

    return () => {
      socket.off("identified", onIdentified);
      socket.off("group:joined", onJoined);
      socket.off("group:peer-joined", onPeerJoined);
      socket.off("group:peer-left", onPeerLeft);
      socket.off("group:peer-promoted", onPeerPromoted);
      socket.off("group:chat-message", onChatMessage);
      socket.off("blocked", onBlocked);
      socket.off("group:force-mute", onForceMute);
      socket.off("group:force-unmute", onForceUnmute);
      socket.off("group:moved-to-waiting", onMovedToWaiting);
      socket.off("group:admitted", onAdmitted);
      socket.off("group:removed", onRemoved);
      socket.off("group:promoted", onPromoted);
      socket.off("group:waiting-list", onWaitingList);
      socket.off("group:peer-muted", onPeerMuted);
      socket.off("group:peer-unmuted", onPeerUnmuted);
      socket.off("group:report-failed", onReportFailed);
    };
  }, [roomId, connectToExistingPeer, closeAll, localStream, navigate]);

  // Applies mutedPeers to the actual received audio tracks, not just the UI —
  // this is what makes a moderator mute stick even if the muted person's
  // client doesn't cooperate: everyone else simply stops playing their audio.
  useEffect(() => {
    Object.entries(remoteStreams).forEach(([socketId, stream]) => {
      const shouldBeMuted = mutedPeers.has(socketId);
      stream.getAudioTracks().forEach((t) => (t.enabled = !shouldBeMuted));
    });
  }, [remoteStreams, mutedPeers]);

  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function toggleMic() {
    if (forceMuted) return; // host-imposed mute — can't self-override, see onForceMute
    localStream?.getAudioTracks().forEach((t) => (t.enabled = !t.enabled));
    setMicOn((v) => !v);
  }

  async function toggleCam() {
    const existingVideoTracks = localStream?.getVideoTracks() || [];
    if (existingVideoTracks.length === 0) {
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const track = videoStream.getVideoTracks()[0];
        localStream.addTrack(track);
        if (phase === "joined") await addVideoTrackToAllPeers(track, localStream);
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

  function leave() {
    navigate("/rooms");
  }
  function sendMessage() {
    const text = draft.trim();
    if (!text) return;
    socket.emit("group:chat-message", { roomId, text });
    setDraft("");
  }
  function submitReport({ reason, details }) {
    socket.emit("group:report", { roomId, targetId: reportTarget.socketId, reason, details });
    setReportTarget(null);
  }

  // --- Moderator actions ---
  const mute = (targetId) => socket.emit("group:mod-mute", { roomId, targetId });
  const unmute = (targetId) => socket.emit("group:mod-unmute", { roomId, targetId });
  const moveToWaiting = (targetId) => socket.emit("group:mod-move-waiting", { roomId, targetId });
  const remove = (targetId) => {
    if (confirm("Remove this person from the room?")) socket.emit("group:mod-remove", { roomId, targetId });
  };
  const promote = (targetId) => socket.emit("group:mod-promote", { roomId, targetId });
  const admit = (targetId) => socket.emit("group:mod-admit", { roomId, targetId });
  const deny = (targetId) => socket.emit("group:mod-deny", { roomId, targetId });

  if (phase === "blocked") {
    return (
      <div className="min-h-screen flex items-center justify-center text-center px-6">
        <div>
          <h2 className="font-display text-2xl text-white mb-2">Can't join this room</h2>
          <p className="text-mist max-w-sm">Mic access was denied, or this device is currently restricted.</p>
          <button onClick={() => navigate("/rooms")} className="mt-6 px-5 py-2.5 rounded-lg bg-signal text-ink font-semibold">
            Back to rooms
          </button>
        </div>
      </div>
    );
  }

  if (phase === "waiting") {
    return (
      <div className="min-h-screen flex items-center justify-center text-center px-6">
        <div>
          <div className="w-14 h-14 rounded-full bg-panel2 mx-auto mb-4 animate-pulse" />
          <h2 className="font-display text-2xl text-white mb-2">You're in the waiting room</h2>
          <p className="text-mist max-w-sm">The host moved you here. You'll rejoin automatically if they let you back in.</p>
          <button onClick={leave} className="mt-6 px-5 py-2.5 rounded-lg bg-panel2 border border-white/10 text-mist hover:text-white">
            Leave instead
          </button>
        </div>
      </div>
    );
  }

  if (phase === "connecting-media") {
    return (
      <div className="min-h-screen flex items-center justify-center text-center px-6">
        <div>
          <div className="w-14 h-14 rounded-full bg-panel2 mx-auto mb-4 animate-pulse" />
          <p className="text-mist font-mono text-sm">Getting your mic ready…</p>
        </div>
      </div>
    );
  }

  const totalTiles = 1 + peers.length;
  const gridCols = totalTiles <= 2 ? "grid-cols-1 sm:grid-cols-2" : totalTiles <= 4 ? "grid-cols-2" : "grid-cols-2 md:grid-cols-3";

  return (
    <div className="min-h-screen flex flex-col px-4 md:px-8 py-4">
      <header className="flex items-center justify-between mb-4">
        <button onClick={leave} className="text-mist hover:text-white text-sm">← Rooms</button>
        <div className="text-center">
          <h1 className="font-display font-semibold text-white flex items-center gap-2 justify-center">
            {room?.name || "Room"}
            {isModerator && (
              <span className="text-[10px] font-mono uppercase tracking-wide px-2 py-0.5 rounded-full bg-signal/15 text-signal2 border border-signal/30">
                host
              </span>
            )}
          </h1>
          <p className="text-xs text-mist font-mono">{totalTiles} {totalTiles === 1 ? "person" : "people"} · live</p>
        </div>
        <span className="w-12" />
      </header>

      {banner && (
        <div className="mb-3 mx-auto px-4 py-2 rounded-lg bg-violet/15 border border-violet/30 text-violet text-sm font-mono">
          {banner}
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4 min-h-0">
        <div className="flex flex-col gap-4 min-h-0">
          <div className={`grid ${gridCols} gap-3 flex-1 content-start`}>
            <VideoTile stream={localStream} muted mirrored label={`You (${displayName.current})`} />
            {peers.map((p) => (
              <div key={p.socketId} className="relative">
                <VideoTile stream={remoteStreams[p.socketId]} label={`${p.displayName}${p.isModerator ? " · host" : ""}`} />
                {mutedPeers.has(p.socketId) && (
                  <span className="absolute top-2 left-2 text-[11px] px-2 py-1 rounded-md bg-black/60 text-coral backdrop-blur">
                    🔇 muted
                  </span>
                )}
                <div className="absolute top-2 right-2 flex gap-1">
                  <button
                    onClick={() => setReportTarget(p)}
                    className="text-[11px] px-2 py-1 rounded-md bg-black/50 text-coral hover:bg-coral/20 backdrop-blur"
                  >
                    Report
                  </button>
                  {isModerator && !p.isModerator && (
                    <ModMenu
                      isMuted={mutedPeers.has(p.socketId)}
                      onMute={() => mute(p.socketId)}
                      onUnmute={() => unmute(p.socketId)}
                      onWaitingRoom={() => moveToWaiting(p.socketId)}
                      onRemove={() => remove(p.socketId)}
                      onPromote={() => promote(p.socketId)}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-center gap-3 py-2">
            <button
              onClick={toggleMic}
              disabled={forceMuted}
              title={forceMuted ? "Muted by the host" : micOn ? "Mute mic" : "Unmute mic"}
              className={`w-12 h-12 rounded-full flex items-center justify-center border ${
                forceMuted
                  ? "bg-coral/10 border-coral/30 text-coral cursor-not-allowed opacity-70"
                  : micOn
                  ? "bg-panel2 border-white/10 text-white"
                  : "bg-coral/10 border-coral/30 text-coral"
              }`}
            >
              {micOn && !forceMuted ? "🎙️" : "🔇"}
            </button>
            <button
              onClick={toggleCam}
              className={`w-12 h-12 rounded-full flex items-center justify-center border ${
                camOn ? "bg-panel2 border-white/10 text-white" : "bg-coral/10 border-coral/30 text-coral"
              }`}
              title={camOn ? "Turn camera off" : "Turn camera on"}
            >
              {camOn ? "📹" : "🚫"}
            </button>
            <button onClick={leave} className="px-6 py-3 rounded-full bg-coral text-ink font-display font-semibold text-sm hover:brightness-110">
              Leave room
            </button>
          </div>
        </div>

        <div className="hidden lg:flex flex-col gap-4 min-h-0">
          {isModerator && waitingList.length > 0 && (
            <div className="bg-panel rounded-2xl border border-violet/30 overflow-hidden">
              <div className="px-4 py-3 border-b border-white/5 font-display text-sm text-violet">
                Waiting room · {waitingList.length}
              </div>
              <div className="p-3 space-y-2">
                {waitingList.map((w) => (
                  <div key={w.socketId} className="flex items-center justify-between text-sm">
                    <span className="text-white/90">{w.displayName}</span>
                    <div className="flex gap-1.5">
                      <button onClick={() => admit(w.socketId)} className="px-2 py-1 rounded-md bg-signal/15 text-signal2 text-xs">
                        Admit
                      </button>
                      <button onClick={() => deny(w.socketId)} className="px-2 py-1 rounded-md bg-coral/15 text-coral text-xs">
                        Deny
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex-1 flex flex-col bg-panel rounded-2xl border border-white/5 overflow-hidden min-h-0">
            <div className="px-4 py-3 border-b border-white/5 font-display text-sm text-mist">Room chat</div>
            <div ref={chatScrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {messages.map((m, i) => (
                <div key={i} className="text-sm">
                  <span className="text-signal2 font-medium">{m.displayName}: </span>
                  <span className="text-white/90">{m.text}</span>
                </div>
              ))}
            </div>
            <div className="p-3 border-t border-white/5 flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                placeholder="Say something…"
                maxLength={2000}
                className="flex-1 bg-panel2 rounded-lg px-3 py-2 text-sm text-white placeholder:text-mist/50 outline-none focus-visible:outline-signal"
              />
              <button onClick={sendMessage} className="px-4 py-2 rounded-lg bg-signal text-ink text-sm font-semibold">
                Send
              </button>
            </div>
          </div>
        </div>
      </div>

      <ReportModal open={!!reportTarget} onClose={() => setReportTarget(null)} onSubmit={submitReport} />
    </div>
  );
}

function ModMenu({ isMuted, onMute, onUnmute, onWaitingRoom, onRemove, onPromote }) {
  const [open, setOpen] = useState(false);
  const items = [
    isMuted ? ["Unmute", onUnmute] : ["Mute mic", onMute],
    ["Waiting room", onWaitingRoom],
    ["Make moderator", onPromote],
    ["Remove", onRemove],
  ];
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-[11px] px-2 py-1 rounded-md bg-black/50 text-signal2 hover:bg-signal/20 backdrop-blur"
      >
        Host ⋯
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-40 bg-panel2 border border-white/10 rounded-lg overflow-hidden z-10 text-sm">
          {items.map(([label, fn]) => (
            <button
              key={label}
              onClick={() => {
                fn();
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-white/90 hover:bg-white/5"
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
