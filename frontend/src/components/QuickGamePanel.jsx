import { useEffect, useRef, useState } from "react";

export default function QuickGamePanel({ game, isModerator, onStart, onTap, onAnswer, onDraw, onStop, error, isDrawer, drawWord, isBombTurn, canEndGame }) {
  const [mode, setMode] = useState("pulse");
  const [submittedToken, setSubmittedToken] = useState(null);
  const [guess, setGuess] = useState("");
  const [ink, setInk] = useState("#f9a8d4");
  const [eraser, setEraser] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(45);
  const canvasRef = useRef(null);
  const activeStroke = useRef(null);
  const topPlayers = game?.players?.slice(0, 5) || [];
  const bomb = game?.type === "bomb";
  const draw = game?.type === "draw";
  const live = game?.status === "live";
  const countdown = game?.status === "countdown";
  const question = game?.status === "question";
  const result = game?.status === "result";
  const finished = game?.status === "finished";

  useEffect(() => {
    setSubmittedToken(null);
    setGuess("");
  }, [game?.questionToken]);

  useEffect(() => {
    if (!game?.roundEndsAt) return undefined;
    const update = () => setSecondsLeft(Math.max(0, Math.ceil((game.roundEndsAt - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 500);
    return () => window.clearInterval(timer);
  }, [game?.roundEndsAt]);

  useEffect(() => {
    if (!draw || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = rect.width * ratio; canvas.height = rect.height * ratio;
    const ctx = canvas.getContext("2d"); ctx.scale(ratio, ratio); ctx.clearRect(0, 0, rect.width, rect.height);
    (game.drawStrokes || []).forEach((stroke) => drawStroke(ctx, stroke, rect.width, rect.height));
  }, [draw, game?.drawStrokes]);

  function drawStroke(ctx, stroke, width, height) {
    if (!stroke?.points?.length) return;
    ctx.save(); ctx.globalCompositeOperation = stroke.erase ? "destination-out" : "source-over"; ctx.strokeStyle = stroke.color || "#fff"; ctx.lineWidth = stroke.size || 4; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.beginPath();
    stroke.points.forEach((point, index) => { const x = point.x * width; const y = point.y * height; if (!index) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
    ctx.stroke(); ctx.restore();
  }

  function pointerDown(event) {
    if (!isDrawer || game?.status !== "drawing") return;
    const rect = canvasRef.current.getBoundingClientRect();
    activeStroke.current = { color: ink, erase: eraser, size: eraser ? 24 : 5, points: [{ x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height }] };
    canvasRef.current.setPointerCapture(event.pointerId);
  }
  function pointerMove(event) {
    if (!activeStroke.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    activeStroke.current.points.push({ x: Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1), y: Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1) });
    const ctx = canvasRef.current.getContext("2d"); drawStroke(ctx, activeStroke.current, rect.width, rect.height);
  }
  function pointerUp() { if (activeStroke.current) onDraw(activeStroke.current); activeStroke.current = null; }
  function submitGuess(event) { event.preventDefault(); if (!guess.trim()) return; onAnswer(guess.trim(), null); setGuess(""); }

  function answer(answerOption) {
    if (!game?.questionToken || submittedToken === game.questionToken) return;
    setSubmittedToken(game.questionToken);
    onAnswer(answerOption, game.questionToken);
  }

  return (
    <section className="rounded-2xl border border-fuchsia-300/25 bg-gradient-to-br from-fuchsia-400/10 via-panel/90 to-violet/10 p-4 shadow-[0_14px_50px_rgba(217,70,239,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-fuchsia-200">Live mini-game</p>
          <h2 className="mt-1 font-display text-lg font-semibold text-white">{game?.title || "Room Arcade"}</h2>
          <p className="mt-1 text-xs text-mist">Short rounds, shared scores, zero awkward setup.</p>
        </div>
        {game && <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-mono text-white/70">{game.round}/{game.totalRounds}</span>}
      </div>

      {!game && <div className="mt-4">
        <p className="text-sm leading-relaxed text-white/80">Pick a fast reaction challenge, Draw & Guess, or Bomb Party.</p>
        {isModerator ? <>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <button onClick={() => setMode("pulse")} className={`rounded-xl border px-3 py-3 text-left transition ${mode === "pulse" ? "border-fuchsia-300/60 bg-fuchsia-400/15" : "border-white/10 bg-black/10 hover:bg-white/5"}`}>
              <span className="block text-sm font-semibold text-white">Pulse Clash</span><span className="mt-1 block text-[11px] text-mist">Tap first</span>
            </button>
            <button onClick={() => setMode("draw")} className={`rounded-xl border px-3 py-3 text-left transition ${mode === "draw" ? "border-signal/70 bg-signal/15" : "border-white/10 bg-black/10 hover:bg-white/5"}`}>
              <span className="block text-sm font-semibold text-white">Draw & Guess</span><span className="mt-1 block text-[11px] text-mist">Sketch the word</span>
            </button>
            <button onClick={() => setMode("bomb")} className={`rounded-xl border px-3 py-3 text-left transition ${mode === "bomb" ? "border-amber-300/70 bg-amber-300/15" : "border-white/10 bg-black/10 hover:bg-white/5"}`}>
              <span className="block text-sm font-semibold text-white">💣 Bomb Party</span><span className="mt-1 block text-[11px] text-mist">Word under pressure</span>
            </button>
          </div>
          <button onClick={() => onStart(mode)} className="mt-3 w-full rounded-xl bg-fuchsia-400 px-4 py-3 text-sm font-bold text-[#1b1022] shadow-lg shadow-fuchsia-500/15 hover:brightness-110">Start {mode === "bomb" ? "Bomb Party" : mode === "draw" ? "Draw & Guess" : "Pulse Clash"}</button>
        </> : <p className="mt-4 rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-center text-xs text-mist">Waiting for a host or Music Mod to start.</p>}
      </div>}

      {game && <>
        <div className="mt-4 rounded-xl border border-white/10 bg-black/15 p-3 text-center">
          {countdown && <><p className="text-sm font-semibold text-white">Get ready…</p><p className="mt-1 text-xs text-mist">Round {game.round} is about to begin</p></>}
          {live && <><p className="text-sm font-semibold text-fuchsia-100">NOW!</p><button onClick={onTap} className="mt-3 h-24 w-full rounded-2xl bg-fuchsia-400 text-4xl font-black text-[#1b1022] shadow-[0_0_35px_rgba(232,121,249,0.55)] transition hover:scale-[1.02] active:scale-95">TAP</button></>}
          {question && <>
            <p className="text-left text-sm font-semibold leading-relaxed text-white">{game.question}</p>
            <div className="mt-3 grid gap-2">
              {game.answers.map((answerOption) => <button key={answerOption} disabled={submittedToken === game.questionToken} onClick={() => answer(answerOption)} className="rounded-xl border border-violet/30 bg-violet/10 px-3 py-2.5 text-left text-xs text-white transition hover:bg-violet/25 disabled:cursor-not-allowed disabled:opacity-60">{answerOption}</button>)}
            </div>
            <p className="mt-3 text-[11px] text-mist">{game.answeredCount || 0} answered · 15 seconds</p>
          </>}
          {draw && game.status === "drawing" && <>
            <p className="text-sm font-semibold text-white">{isDrawer ? `Your word: ${drawWord || game.maskedWord}` : `${game.drawerName} is drawing`}</p>
            <p className="mt-1 text-xs text-mist">{isDrawer ? `Draw it on the canvas · ${secondsLeft}s left` : `Guess: ${game.maskedWord} · ${secondsLeft}s left`}</p>
            {isDrawer && <div className="mt-3 flex items-center gap-2 rounded-lg border border-white/10 bg-black/15 p-2">
              {["#f9a8d4", "#67e8f9", "#fde68a", "#ffffff"].map((color) => <button key={color} onClick={() => { setInk(color); setEraser(false); }} aria-label={`Use ${color} pen`} className={`h-6 w-6 rounded-full border-2 ${ink === color && !eraser ? "border-white" : "border-transparent"}`} style={{ backgroundColor: color }} />)}
              <button onClick={() => setEraser((current) => !current)} className={`ml-auto rounded-md px-2.5 py-1.5 text-[11px] font-semibold ${eraser ? "bg-white text-ink" : "bg-white/10 text-white hover:bg-white/20"}`}>⌫ Eraser</button>
            </div>}
            <canvas ref={canvasRef} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} className={`mt-3 h-48 w-full touch-none rounded-xl bg-[#101522] ${isDrawer ? "cursor-crosshair" : "cursor-default"}`} />
            {!isDrawer && <form onSubmit={submitGuess} className="mt-3 flex gap-2"><input value={guess} onChange={(event) => setGuess(event.target.value)} placeholder="Type your guess" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white outline-none" /><button className="rounded-lg bg-signal px-3 py-2 text-xs font-bold text-ink">Guess</button></form>}
          </>}
          {bomb && game.status === "bombing" && <>
            <div className="rounded-xl border border-amber-300/30 bg-amber-300/10 p-3"><p className="text-3xl font-black tracking-[0.2em] text-amber-200">{game.bombSyllable?.toUpperCase()}</p><p className="mt-1 text-[11px] text-amber-100/80">Use these letters in a new word · {secondsLeft}s</p></div>
            {isBombTurn ? <form onSubmit={submitGuess} className="mt-3 flex gap-2"><input autoFocus value={guess} onChange={(event) => setGuess(event.target.value)} placeholder="Type a word…" className="min-w-0 flex-1 rounded-lg border border-amber-300/20 bg-black/20 px-3 py-2 text-xs text-white outline-none" /><button className="rounded-lg bg-amber-300 px-3 py-2 text-xs font-bold text-ink">Pass 💥</button></form> : <p className="mt-3 rounded-lg bg-white/5 px-3 py-2 text-xs text-mist">{game.bombTurnName} has the bomb. Watch closely!</p>}
          </>}
          {result && <><p className="text-sm font-semibold text-white">{game.winnerId ? `${game.roundWinnerName || game.winnerName} scored!` : game.roundWinnerName || "Round over."}</p><p className="mt-1 text-xs text-mist">Next round loading…</p></>}
          {finished && <><p className="text-sm font-semibold text-white">{game.finalWinnerName ? `🏆 ${game.finalWinnerName} takes the crown!` : "That was a draw."}</p><button onClick={isModerator ? () => onStart(game.type || mode) : undefined} disabled={!isModerator} className="mt-3 rounded-lg bg-fuchsia-400 px-3 py-2 text-xs font-bold text-[#1b1022] disabled:opacity-40">{isModerator ? "Rematch" : "Game complete"}</button></>}
        </div>
        <div className="mt-3 space-y-1.5">{topPlayers.map((player, index) => <div key={player.socketId} className="flex items-center justify-between rounded-lg border border-white/5 bg-black/10 px-2.5 py-2 text-xs"><span className="truncate text-white/85"><span className="mr-2 text-mist">{index + 1}</span>{player.displayName}</span><span className="font-mono text-fuchsia-200">{player.score} pt{player.streak > 1 ? ` · ${player.streak}🔥` : ""}</span></div>)}</div>
        {canEndGame ? <button onClick={onStop} className="mt-3 w-full rounded-lg border border-coral/30 px-3 py-2 text-xs font-semibold text-coral hover:bg-coral/10">End game (Admin)</button> : <p className="mt-3 text-center text-[10px] text-mist/60">The game finishes automatically after the final round.</p>}
      </>}
      {error && <p className="mt-2 text-xs text-coral">{error}</p>}
    </section>
  );
}
