import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { socket, getDisplayName, getFingerprint } from "../lib/socket.js";
import { api } from "../lib/api.js";
import { useGroupWebRTC } from "../hooks/useGroupWebRTC.js";
import VideoTile from "../components/VideoTile.jsx";
import { MusicPlayerBoundary } from "../components/MusicPlayer.jsx";
import ReportModal from "../components/ReportModal.jsx";

export default function GroupRoom() {
  const { roomId } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const [room, setRoom] = useState(state?.room || null);
  const [localStream, setLocalStream] = useState(null);
  const [micOn, setMicOn] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [peers, setPeers] = useState([]);
  const [phase, setPhase] = useState("connecting-media");
  const [isModerator, setIsModerator] = useState(false);
  const [waitingList, setWaitingList] = useState([]);
  const [mutedPeers, setMutedPeers] = useState(() => new Set());
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [banner, setBanner] = useState(null);
  const [blockedReason, setBlockedReason] = useState(null);
  const [forceMuted, setForceMuted] = useState(false);
  const [music, setMusic] = useState(null);
  const [reportTargetId, setReportTargetId] = useState(null);
  const [socketReady, setSocketReady] = useState(socket.connected);
  const chatScrollRef = useRef(null);
  const displayName = useRef(getDisplayName() || `Guest-${getFingerprint().slice(0, 4)}`);
  const [role, setRole] = useState("user");
  const localStreamRef = useRef(null);
  const mediaRequested = useRef(false);
  const identifySent = useRef(false);
  const { remoteStreams, connectionStates, connectToExistingPeer, setRoomId, closeAll, addVideoTrackToAllPeers } = useGroupWebRTC({ localStream });

  useEffect(() => {
    if (!getDisplayName()) navigate("/", { state: { returnTo: `/rooms/${roomId}` } });
  }, [navigate, roomId]);

  useEffect(() => {
    if (!room) api.getRoom(roomId).then(setRoom).catch(() => {});
  }, [room, roomId]);

  useEffect(() => setRoomId(roomId), [roomId, setRoomId]);

  useEffect(() => {
    if (mediaRequested.current) return;
    mediaRequested.current = true;
    const connectRoom = () => {
      socket.connect();
    };

    // Room access must not depend on microphone permission. A user can join
    // muted and enable the microphone later from the call controls.
    connectRoom();
    navigator.mediaDevices?.getUserMedia({ video: false, audio: true }).then((stream) => {
      stream.getAudioTracks().forEach((track) => { track.enabled = false; });
      localStreamRef.current = stream;
      setLocalStream(stream);
    }).catch(() => {});

    return () => {
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      closeAll();
      socket.emit("group:leave", { roomId });
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const showBanner = (text) => {
      setBanner(text);
      window.setTimeout(() => setBanner((current) => current === text ? null : current), 3800);
    };
    function onIdentified(identity) {
      if (identity?.displayName) displayName.current = identity.displayName;
      setRole(identity?.role || "user");
      socket.emit("group:join", { roomId, displayName: displayName.current });
    }
    function onJoined({ existingPeers, isModerator: moderator }) {
      const safePeers = Array.isArray(existingPeers) ? existingPeers.filter((peer) => peer && typeof peer === "object") : [];
      setPhase("joined"); setPeers(safePeers); setIsModerator(Boolean(moderator));
      setMutedPeers(new Set(safePeers.filter((peer) => peer.isMuted).map((peer) => peer.socketId)));
      safePeers.forEach((peer) => peer.socketId && connectToExistingPeer(peer.socketId));
    }
    function onPeerJoined(peer) {
      if (!peer || typeof peer !== "object") return;
      setPeers((current) => [...current, peer]);
      if (peer.role === "developer") showBanner(`◈ DEVELOPER • ${peer.displayName || "Developer"} joined`);
      else if (peer.role === "admin") showBanner(`ADMIN • ${peer.displayName || "Admin"} joined`);
    }
    function onPeerLeft({ socketId }) { setPeers((current) => current.filter((peer) => peer.socketId !== socketId)); }
    function onPeerPromoted({ socketId }) { setPeers((current) => current.map((peer) => peer.socketId === socketId ? { ...peer, isModerator: true } : peer)); }
    function onPeerDemoted({ socketId, displayName: demotedName }) {
      setPeers((current) => current.map((peer) => peer.socketId === socketId ? { ...peer, isModerator: false } : peer));
      if (demotedName) showBanner(`${demotedName} is no longer a host.`);
    }
    function onChatMessage(message) {
      if (!message || typeof message !== "object") return;
      setMessages((current) => {
        const safeMessages = Array.isArray(current)
          ? current.filter((item) => item && typeof item === "object")
          : [];
        const incomingId = message.clientMessageId;
        if (!incomingId) return [...safeMessages, message];
        const alreadyExists = safeMessages.some(
          (item) => item && typeof item === "object" && item.clientMessageId === incomingId
        );
        return alreadyExists ? safeMessages : [...safeMessages, message];
      });
    }
    function onForceMute() { localStream?.getAudioTracks().forEach((track) => { track.enabled = false; }); setMicOn(false); setForceMuted(true); showBanner("The host muted your mic."); }
    function onForceUnmute() { setForceMuted(false); showBanner("Your mic is available again."); }
    function onMovedToWaiting() { closeAll(); setPeers([]); setPhase("waiting"); }
    function onAdmitted() { setPeers([]); setForceMuted(false); setPhase("connecting-media"); socket.emit("group:join", { roomId, displayName: displayName.current }); }
    function onRemoved({ reason }) { alert(reason || "You were removed from this room."); navigate("/rooms"); }
    function onPeerMuted({ socketId }) { setMutedPeers((current) => new Set(current).add(socketId)); }
    function onPeerUnmuted({ socketId }) { setMutedPeers((current) => { const next = new Set(current); next.delete(socketId); return next; }); }
    function onPromoted() { setIsModerator(true); showBanner("You are now a room host."); }
    function onDemoted({ message }) { setIsModerator(false); showBanner(message || "Your host role was removed."); }
    function onMusicState(next) {
      if (!next || typeof next !== "object") return;
      if (next.status === "stopped") {
        setMusic(null);
        return;
      }
      const hasPlayableTrack = next.type === "youtube"
        ? typeof next.videoId === "string" && next.videoId.length > 0
        : typeof next.previewUrl === "string" && next.previewUrl.length > 0;
      if (!hasPlayableTrack) return;
      setMusic((current) => ({ ...current, ...next, receivedAt: Date.now() }));
    }
    function onMusicError({ message }) { showBanner(message); }
    function onWaitingList({ waiting }) { setWaitingList(Array.isArray(waiting) ? waiting : []); }
    function identify() {
      if (identifySent.current) return;
      identifySent.current = true;
      socket.emit("identify", { fingerprint: getFingerprint(), displayName: displayName.current, ageConfirmed: true });
    }
    function onBlocked({ reason }) {
      identifySent.current = false;
      setBlockedReason(reason);
      setPhase("blocked");
      if (reason === "server_error") showBanner("The room service could not verify your session. Please try again.");
    }
    function onConnect() { setSocketReady(true); identify(); }
    function onDisconnect() { setSocketReady(false); }

    socket.on("connect", onConnect); socket.on("disconnect", onDisconnect);
    socket.on("blocked", onBlocked);
    socket.on("identified", onIdentified); socket.on("group:joined", onJoined);
    socket.on("group:peer-joined", onPeerJoined); socket.on("group:peer-left", onPeerLeft); socket.on("group:peer-promoted", onPeerPromoted); socket.on("group:peer-demoted", onPeerDemoted);
    socket.on("group:chat-message", onChatMessage); socket.on("group:force-mute", onForceMute);
    socket.on("group:force-unmute", onForceUnmute); socket.on("group:moved-to-waiting", onMovedToWaiting);
    socket.on("group:admitted", onAdmitted); socket.on("group:removed", onRemoved);
    socket.on("group:promoted", onPromoted); socket.on("group:demoted", onDemoted); socket.on("group:peer-muted", onPeerMuted);
    socket.on("group:peer-unmuted", onPeerUnmuted); socket.on("group:music-state", onMusicState);
    socket.on("group:music-error", onMusicError); socket.on("group:waiting-list", onWaitingList);
    if (socket.connected) identify();

    return () => {
      ["connect", "disconnect", "blocked", "identified", "group:joined", "group:peer-joined", "group:peer-left", "group:peer-promoted", "group:peer-demoted", "group:chat-message", "group:force-mute", "group:force-unmute", "group:moved-to-waiting", "group:admitted", "group:removed", "group:promoted", "group:demoted", "group:peer-muted", "group:peer-unmuted", "group:music-state", "group:music-error", "group:waiting-list"].forEach((event) => socket.off(event));
    };
  }, [closeAll, connectToExistingPeer, localStream, navigate, roomId]);

  useEffect(() => {
    Object.entries(remoteStreams).forEach(([socketId, stream]) => stream.getAudioTracks().forEach((track) => { track.enabled = !mutedPeers.has(socketId); }));
  }, [mutedPeers, remoteStreams]);
  useEffect(() => { chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages]);

  async function toggleMic() {
    if (forceMuted) return;
    const existingAudioTrack = localStream?.getAudioTracks?.().find((track) => track.readyState === "live");
    if (!existingAudioTrack) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
        stream.getAudioTracks().forEach((track) => { track.enabled = true; });
        localStreamRef.current = stream;
        setLocalStream(stream);
        setMicOn(true);
      } catch {
        setBanner("Microphone permission is unavailable.");
        window.setTimeout(() => setBanner((current) => current === "Microphone permission is unavailable." ? null : current), 3800);
      }
      return;
    }
    localStream?.getAudioTracks().forEach((track) => { track.enabled = !track.enabled; });
    setMicOn((current) => !current);
  }
  async function toggleCam() {
    const tracks = localStream?.getVideoTracks() || [];
    if (!tracks.length) {
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const track = videoStream.getVideoTracks()[0]; localStream.addTrack(track);
        if (phase === "joined") await addVideoTrackToAllPeers(track, localStream);
        setCamOn(true);
      } catch { alert("Camera access was denied or unavailable."); }
      return;
    }
    const next = !camOn; tracks.forEach((track) => { track.enabled = next; }); setCamOn(next);
  }
  function leave() { navigate("/rooms"); }
  function sendMessage() {
    const text = draft.trim();
    if (!text || !socketReady) return;
    const clientMessageId = crypto.randomUUID();
    socket.emit("group:chat-message", { roomId, text, clientMessageId }, (result) => {
      if (!result?.ok) return;
      if (result.message && typeof result.message === "object") {
        setMessages((current) => {
          const safeMessages = Array.isArray(current)
            ? current.filter((item) => item && typeof item === "object")
            : [];
          const messageId = result.message.clientMessageId;
          if (messageId && safeMessages.some(
            (item) => item && typeof item === "object" && item.clientMessageId === messageId
          )) return safeMessages;
          return [...safeMessages, result.message];
        });
      }
      setDraft("");
    });
  }
  function submitGroupReport(report) {
    if (!reportTargetId) return;
    socket.emit("group:report-user", { roomId, targetId: reportTargetId, ...report }, (result) => {
      if (!result?.ok) {
        setBanner(result?.error || "Report could not be submitted.");
        return;
      }
      setReportTargetId(null);
      setBanner("Report submitted. Thank you for helping keep the room safe.");
    });
  }
  const mod = (event, targetId) => socket.emit(event, { roomId, targetId });

  if (phase === "blocked") {
    const blockedText = blockedReason === "banned"
      ? "This device or session is currently restricted. If this seems wrong, ask an administrator to review the active ban."
      : blockedReason === "age_confirmation_required"
        ? "Age confirmation is required before joining."
        : blockedReason === "rate_limited"
          ? "Too many connection attempts came from this network. Please wait a few minutes and try again. This is not a ban."
          : blockedReason === "server_error"
            ? "The room server could not verify your session. Please refresh and try again."
            : "The room connection could not be verified. Please try again.";
    return <EmptyState title={blockedReason === "banned" ? "Access restricted" : "Can't join this room"} text={blockedText} action="Back to rooms" onAction={leave} />;
  }
  if (phase === "waiting") return <EmptyState title="You're in the waiting room" text="The host moved you here. You'll rejoin automatically if they let you back in." action="Leave instead" onAction={leave} />;
  if (phase === "connecting-media") return <EmptyState title="Joining your room" text="Connecting securely…" />;

  const totalTiles = peers.length + 1;
  const visiblePeers = peers.filter((peer) => peer && typeof peer === "object");
  const visibleWaiting = waitingList.filter((person) => person && typeof person === "object");
  const visibleMessages = messages.filter((message) => message && typeof message === "object");
  const hasConnectionIssue = Object.values(connectionStates).some((state) => ["disconnected", "connecting", "new"].includes(state));
  const hasLiveAudio = Boolean(localStream?.getAudioTracks?.().some((track) => track.readyState === "live"));
  const gridCols = totalTiles <= 2 ? "grid-cols-1 sm:grid-cols-2" : totalTiles <= 4 ? "grid-cols-2" : "grid-cols-2 md:grid-cols-3";
  return (
    <div className="min-h-screen flex flex-col px-3 sm:px-4 md:px-8 py-3 sm:py-4">
      <header className="flex flex-wrap items-center justify-between gap-2 mb-3 sm:mb-4 pb-3 sm:pb-4 border-b border-white/5">
        <button onClick={leave} className="text-mist hover:text-white text-sm transition shrink-0">← Rooms</button>
        <div className="text-center flex-1 min-w-0 order-3 sm:order-none basis-full sm:basis-auto">
          <h1 className="font-display font-semibold text-white flex items-center gap-2 justify-center truncate">
            <span className="truncate">{room?.name || "Room"}</span>
            {isModerator && <span className="text-[10px] font-mono uppercase tracking-wide px-2 py-0.5 rounded-full bg-signal/15 text-signal2 border border-signal/30 shrink-0">host</span>}
          </h1>
          <p className="text-xs text-mist font-mono mt-1">{totalTiles} {totalTiles === 1 ? "person" : "people"} · live</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!hasLiveAudio && <span className="hidden sm:inline text-xs font-mono text-amber-300">mic not connected</span>}
          {hasConnectionIssue && <span className="hidden sm:inline text-xs font-mono text-amber-300">audio reconnecting</span>}
          <span className={`flex items-center gap-2 text-xs font-mono ${socketReady ? "text-signal2" : "text-coral"}`}><span className={`w-2 h-2 rounded-full ${socketReady ? "bg-signal animate-pulse" : "bg-coral"}`} />{socketReady ? "live" : "reconnecting"}</span>
        </div>
      </header>
      {banner && <div className={`mb-3 mx-auto max-w-[92%] px-4 py-2 rounded-xl text-sm font-mono text-center animate-enter ${banner.startsWith("◈") ? "role-entrance-developer" : "role-entrance-admin"}`}>{banner}</div>}
      {phase === "joined" && (!hasLiveAudio || hasConnectionIssue) && (
        <div className="mb-3 mx-auto flex max-w-2xl items-center justify-between gap-3 rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-xs text-amber-100">
          <span>{!hasLiveAudio ? "Your microphone is not connected yet. You can still listen, or tap the mic button to retry." : "Some audio connections are recovering. Stay in the room while we reconnect them."}</span>
          {!hasLiveAudio && <button onClick={toggleMic} className="shrink-0 rounded-lg border border-amber-200/30 px-3 py-1.5 font-semibold hover:bg-amber-200/10">Retry mic</button>}
        </div>
      )}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 sm:gap-5 min-h-0">
        <div className="flex flex-col gap-3 sm:gap-4 min-h-0">
          <MusicPlayerBoundary music={music} isModerator={isModerator} onStop={() => socket.emit("group:music-stop", { roomId })} />
          <div className={`relative z-20 grid ${gridCols} gap-2 sm:gap-3 flex-1 content-start animate-enter`}>
            <VideoTile stream={localStream} muted mirrored label={displayName.current} role={role} />
            {visiblePeers.map((peer) => (
              <div key={peer.socketId} className="relative z-0 focus-within:z-20 has-[[data-menu-open=true]]:z-[60]">
                <VideoTile stream={remoteStreams[peer.socketId]} label={peer.displayName || "Guest"} role={peer.role || "user"} />
                {role === "user" && <button onClick={() => setReportTargetId(peer.socketId)} className="absolute top-11 left-2 z-10 rounded-md border border-coral/30 bg-black/75 px-2.5 py-1 text-[11px] font-medium text-coral backdrop-blur hover:bg-coral/20">Report</button>}
                {mutedPeers.has(peer.socketId) && <span className="absolute top-20 left-2 z-10 text-[11px] px-2 py-1 rounded-md bg-black/60 text-coral backdrop-blur">muted</span>}
                {isModerator && peer.role !== "developer" && (role === "developer" || !peer.isModerator || (role === "admin" && peer.role === "user")) && (
                  <ModMenu isDeveloper={role === "developer"} isAdmin={role === "admin"} isModerator={peer.isModerator} targetRole={peer.role || "user"} isMuted={mutedPeers.has(peer.socketId)} onMute={() => mod("group:mod-mute", peer.socketId)} onUnmute={() => mod("group:mod-unmute", peer.socketId)} onWaiting={() => mod("group:mod-move-waiting", peer.socketId)} onRemove={() => { if (confirm("Remove this person from the room?")) mod("group:mod-remove", peer.socketId); }} onPromote={() => mod("group:mod-promote", peer.socketId)} onDemote={() => mod("group:mod-demote", peer.socketId)} />
                )}
              </div>
            ))}
          </div>
          <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-center gap-2 sm:gap-3 py-3 px-2 bg-ink/90 backdrop-blur-md border-t border-white/5 [padding-bottom:calc(0.75rem+env(safe-area-inset-bottom))]">
            <IconButton onClick={toggleMic} disabled={forceMuted} active={micOn && !forceMuted} label={forceMuted ? "Muted by host" : micOn ? "Mute mic" : "Unmute mic"}>{micOn && !forceMuted ? "🎙️" : "🔇"}</IconButton>
            <IconButton onClick={toggleCam} active={camOn} label={camOn ? "Turn camera off" : "Turn camera on"}>{camOn ? "📹" : "🚫"}</IconButton>
            <button onClick={leave} className="px-5 sm:px-6 py-3 rounded-full bg-coral text-ink font-display font-semibold text-sm hover:brightness-110 active:scale-95 transition shadow-lg shadow-coral/10 shrink-0">Leave room</button>
          </div>
        </div>
        <aside className="flex flex-col gap-4 min-h-0 lg:min-h-0">
          {isModerator && visibleWaiting.length > 0 && (
            <div className="bg-panel/85 rounded-2xl border border-violet/30 overflow-hidden surface-lift shrink-0">
              <div className="px-4 py-3 border-b border-white/5 font-display text-sm text-violet">Waiting room · {visibleWaiting.length}</div>
              <div className="p-3 space-y-2 max-h-40 overflow-y-auto">
                {visibleWaiting.map((person) => (
                  <div key={person.socketId} className="flex items-center justify-between text-sm gap-2">
                    <span className="text-white/90 truncate">{person.displayName || "Guest"}</span>
                    <div className="flex gap-1.5 shrink-0">
                      <button onClick={() => mod("group:mod-admit", person.socketId)} className="px-2 py-1 rounded-md bg-signal/15 text-signal2 text-xs">Admit</button>
                      <button onClick={() => mod("group:mod-deny", person.socketId)} className="px-2 py-1 rounded-md bg-coral/15 text-coral text-xs">Deny</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-col bg-panel/85 rounded-2xl border border-white/10 overflow-hidden surface-lift h-[60vh] max-h-[60vh] lg:h-auto lg:flex-1 lg:max-h-none lg:min-h-0">
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between shrink-0">
              <div className="min-w-0">
                <p className="font-display text-sm text-white">Room chat</p>
                <p className="text-[11px] text-mist/60 mt-0.5">Say hi and keep it respectful.</p>
              </div>
              {isModerator && <button onClick={() => setDraft("/play ")} className="px-2 py-1 rounded-md bg-signal/10 text-signal2 text-[11px] hover:bg-signal/20 shrink-0">+ song</button>}
            </div>
            <div ref={chatScrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-3 space-y-2">
              {visibleMessages.length === 0 && <p className="text-sm text-mist/60">The room is quiet. Say hello.</p>}
              {visibleMessages.map((message, index) => (
                <div key={message.clientMessageId || index} className="text-sm break-words">
                  <span className="text-signal2 font-medium">{message.displayName || "Guest"}: </span>
                  <span className="text-white/90 break-words">{message.text || ""}</span>
                </div>
              ))}
            </div>
            <div className="p-3 border-t border-white/5 flex gap-2 shrink-0">
              <input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => event.key === "Enter" && sendMessage()} placeholder="Say something…" maxLength={2000} className="flex-1 min-w-0 bg-panel2 rounded-lg px-3 py-2 text-sm text-white placeholder:text-mist/50 outline-none focus-visible:outline-signal" />
              <button onClick={sendMessage} className="px-4 py-2 rounded-lg bg-signal text-ink text-sm font-semibold hover:brightness-110 transition shrink-0">Send</button>
            </div>
          </div>
        </aside>
      </div>
      <ReportModal open={Boolean(reportTargetId)} onClose={() => setReportTargetId(null)} onSubmit={submitGroupReport} />
    </div>
  );
}

function IconButton({ active, disabled, onClick, label, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`w-14 h-14 sm:w-12 sm:h-12 rounded-full flex items-center justify-center border active:scale-95 transition text-lg touch-manipulation ${disabled ? "bg-coral/10 border-coral/30 text-coral opacity-70 cursor-not-allowed" : active ? "bg-panel2 border-white/10 text-white" : "bg-coral/10 border-coral/30 text-coral"}`}
    >
      {children}
    </button>
  );
}

function ModMenu({ isDeveloper, isAdmin, isModerator, targetRole, isMuted, onMute, onUnmute, onWaiting, onRemove, onPromote, onDemote }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    function onOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", onOutside);
    return () => document.removeEventListener("pointerdown", onOutside);
  }, [open]);
  const canDemote = isModerator && (isDeveloper || (isAdmin && targetRole === "user"));
  const items = isMuted ? [["Unmute", onUnmute], ["Waiting room", onWaiting], ...(!isModerator ? [["Make moderator", onPromote]] : []), ...(canDemote ? [["Remove host role", onDemote]] : []), ["Remove", onRemove]] : [["Mute mic", onMute], ["Waiting room", onWaiting], ...(!isModerator ? [["Make moderator", onPromote]] : []), ...(canDemote ? [["Remove host role", onDemote]] : []), ["Remove", onRemove]];
  return (
    <div ref={menuRef} className="absolute top-2 right-2 z-40" data-menu-open={open}>
      <button
        onClick={() => setOpen((current) => !current)}
        className="text-xs px-3 py-2 min-h-[36px] rounded-md bg-black/70 text-signal2 hover:bg-signal/20 backdrop-blur touch-manipulation"
      >
        Host ···
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-44 bg-panel2 border border-white/10 rounded-lg overflow-hidden text-sm shadow-2xl z-50">
          {items.map(([label, action]) => (
            <button key={label} onClick={() => { action(); setOpen(false); }} className="w-full text-left px-3 py-2.5 text-white/90 hover:bg-white/5 active:bg-white/10 touch-manipulation">
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ title, text, action, onAction }) {
  return (
    <div className="min-h-screen flex items-center justify-center text-center px-6">
      <div className="animate-enter">
        <div className="w-16 h-16 rounded-2xl bg-panel2 border border-white/10 mx-auto mb-5 animate-drift" />
        <h2 className="font-display text-2xl text-white mb-2">{title}</h2>
        <p className="text-mist max-w-sm">{text}</p>
        {action && <button onClick={onAction} className="mt-6 px-5 py-2.5 rounded-lg bg-signal text-ink font-semibold hover:brightness-110 transition">{action}</button>}
      </div>
    </div>
  );
}
