import { useEffect, useRef, useState } from "react";
import { socket, getDisplayName } from "../lib/socket.js";

export default function ChatPanel({ roomId, partnerName = "Stranger" }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [partnerTyping, setPartnerTyping] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    setMessages([]);
  }, [roomId]);

  useEffect(() => {
    function onMessage({ text, at, displayName }) {
      setMessages((m) => [...m, { from: "them", text, at, name: displayName || partnerName }]);
    }
    function onTyping({ isTyping }) {
      setPartnerTyping(isTyping);
    }
    socket.on("chat:message", onMessage);
    socket.on("chat:typing", onTyping);
    return () => {
      socket.off("chat:message", onMessage);
      socket.off("chat:typing", onTyping);
    };
  }, [partnerName]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, partnerTyping]);

  function send() {
    const text = draft.trim();
    if (!text || !roomId) return;
    socket.emit("chat:message", { roomId, text });
    setMessages((m) => [...m, { from: "me", text, at: Date.now(), name: getDisplayName() || "You" }]);
    setDraft("");
    socket.emit("chat:typing", { roomId, isTyping: false });
  }

  return (
    <div className="flex flex-col h-full bg-panel rounded-2xl border border-white/5 overflow-hidden">
      <div className="px-4 py-3 border-b border-white/5 font-display text-sm text-mist">Chat</div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {messages.length === 0 && (
          <p className="text-mist/60 text-sm font-body">Say hi 👋 — messages stay in this session only.</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`max-w-[85%] ${m.from === "me" ? "ml-auto" : "mr-auto"}`}>
            <p className={`text-[11px] font-mono mb-0.5 ${m.from === "me" ? "text-right text-signal2/70" : "text-mist"}`}>
              {m.name}
            </p>
            <div
              className={`px-3 py-2 rounded-xl text-sm ${
                m.from === "me"
                  ? "bg-signal/15 text-signal2 rounded-br-sm"
                  : "bg-panel2 text-white/90 rounded-bl-sm"
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
        {partnerTyping && <p className="text-xs text-mist font-mono">{partnerName} is typing…</p>}
      </div>

      <div className="p-3 border-t border-white/5 flex gap-2">
        <input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            socket.emit("chat:typing", { roomId, isTyping: e.target.value.length > 0 });
          }}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Type a message…"
          maxLength={2000}
          className="flex-1 bg-panel2 rounded-lg px-3 py-2 text-sm text-white placeholder:text-mist/50 outline-none focus-visible:outline-signal"
        />
        <button
          onClick={send}
          className="px-4 py-2 rounded-lg bg-signal text-ink text-sm font-semibold hover:brightness-110"
        >
          Send
        </button>
      </div>
    </div>
  );
}
