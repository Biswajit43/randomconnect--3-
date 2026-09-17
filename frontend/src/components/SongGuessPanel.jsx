import { useEffect, useMemo, useRef, useState } from "react";

const FALLBACK_GENRES = ["Electronic", "Rock", "Hip-Hop/Rap", "Pop", "Ambient", "Jazz", "Classical", "Lo-Fi", "House", "Techno", "Acoustic", "World"];

function secondsUntil(game, receivedAt) {
  if (!game?.roundEndsAt) return 0;
  const serverOffset = (receivedAt || Date.now()) - (game.serverNow || receivedAt || Date.now());
  return Math.max(0, Math.ceil((game.roundEndsAt - (Date.now() - serverOffset)) / 1000));
}

export default function SongGuessPanel({
  game,
  isModerator,
  onStart,
  onGuess,
  onPause,
  onEnd,
  onNext,
  onRematch,
  onAudioFailed,
  error,
}) {
  const [category, setCategory] = useState("trending");
  const [genre, setGenre] = useState("");
  const [rounds, setRounds] = useState(5);
  const [timeLimit, setTimeLimit] = useState(15);
  const [difficulty, setDifficulty] = useState("normal");
  const [decade, setDecade] = useState("any");
  const [query, setQuery] = useState("");
  const [guess, setGuess] = useState("");
  const [feedback, setFeedback] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [needsPlay, setNeedsPlay] = useState(false);
  const [receivedAt, setReceivedAt] = useState(Date.now());
  const audioRef = useRef(null);
  const submitted = useRef(new Set());
  const genres = useMemo(() => FALLBACK_GENRES, []);
  const live = game?.status === "live";
  const paused = game?.status === "paused";
  const result = game?.status === "result";
  const finished = game?.status === "finished";

  useEffect(() => {
    setReceivedAt(Date.now());
    setGuess("");
    setFeedback("");
    setNeedsPlay(false);
    if (game?.roundToken) submitted.current.delete(game.roundToken);
  }, [game?.roundToken]);

  useEffect(() => {
    const update = () => setSecondsLeft(secondsUntil(game, receivedAt));
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [game?.roundEndsAt, game?.serverNow, receivedAt]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !game?.audioUrl) return undefined;
    audio.src = game.audioUrl;
    audio.currentTime = 0;
    if (live) {
      audio.play().then(() => { setPlaying(true); setNeedsPlay(false); }).catch(() => { setPlaying(false); setNeedsPlay(true); });
    } else {
      audio.pause();
      setPlaying(false);
    }
    return undefined;
  }, [game?.audioUrl, game?.roundToken, live]);

  function toggleAudio() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) audio.play().then(() => { setPlaying(true); setNeedsPlay(false); }).catch(() => setNeedsPlay(true));
    else { audio.pause(); setPlaying(false); }
  }

  function submit(value) {
    const answer = String(value || "").trim();
    if (!answer || !game?.roundToken || submitted.current.has(game.roundToken)) return;
    submitted.current.add(game.roundToken);
    onGuess(answer, game.roundToken, (resultState) => {
      if (resultState?.ok) setFeedback(resultState.feedback || (resultState.correct ? `Correct! +${resultState.points}` : "Not quite."));
      else { submitted.current.delete(game.roundToken); setFeedback(resultState?.error || "That guess was not accepted."); }
    });
    setGuess("");
  }

  function start() {
    onStart({ category, genre, rounds, timeLimit, difficulty, decade, query: category === "search" ? query : "" });
  }

  return (
    <section className="rounded-2xl border border-cyan-300/25 bg-gradient-to-br from-cyan-400/10 via-panel/95 to-violet/10 p-4 shadow-[0_14px_50px_rgba(34,211,238,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan-200">Room Arcade · Open music</p>
          <h2 className="mt-1 font-display text-lg font-semibold text-white">Song Guess</h2>
          <p className="mt-1 text-xs text-mist">Open-license playable tracks, shared in this room. Audius is optional.</p>
        </div>
        {game && <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-mono text-white/70">{game.round}/{game.totalRounds}</span>}
      </div>

      {!game && <div className="mt-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <label className="text-[11px] text-mist">Category<select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-2 py-2 text-xs text-white"><option value="trending">Trending</option><option value="popular">Popular</option><option value="random">Random</option><option value="new">New releases</option><option value="search">Search catalog</option></select></label>
          <label className="text-[11px] text-mist">Genre<select value={genre} onChange={(event) => setGenre(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-2 py-2 text-xs text-white"><option value="">Any genre</option>{genres.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="text-[11px] text-mist">Rounds<select value={rounds} onChange={(event) => setRounds(Number(event.target.value))} className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-2 py-2 text-xs text-white">{[3, 5, 8, 12].map((value) => <option key={value} value={value}>{value} rounds</option>)}</select></label>
          <label className="text-[11px] text-mist">Time<select value={timeLimit} onChange={(event) => setTimeLimit(Number(event.target.value))} className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-2 py-2 text-xs text-white">{[10, 15, 20, 30].map((value) => <option key={value} value={value}>{value}s</option>)}</select></label>
          <label className="text-[11px] text-mist">Difficulty<select value={difficulty} onChange={(event) => setDifficulty(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-2 py-2 text-xs text-white"><option value="easy">Easy</option><option value="normal">Normal</option><option value="hard">Hard</option></select></label>
          <label className="text-[11px] text-mist">Decade<select value={decade} onChange={(event) => setDecade(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-2 py-2 text-xs text-white"><option value="any">Any decade</option>{[2020, 2010, 2000, 1990, 1980, 1970].map((value) => <option key={value} value={value}>{value}s</option>)}</select></label>
          <label className="text-[11px] text-mist">Country<select disabled className="mt-1 w-full rounded-lg border border-white/10 bg-black/10 px-2 py-2 text-xs text-mist/60"><option>Audius: unavailable</option></select></label>
          <label className="text-[11px] text-mist">Language<select disabled className="mt-1 w-full rounded-lg border border-white/10 bg-black/10 px-2 py-2 text-xs text-mist/60"><option>Audius: unavailable</option></select></label>
        </div>
        {category === "search" && <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Artist or song search" className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white outline-none" />}
        {isModerator ? <button onClick={start} className="mt-3 w-full rounded-xl bg-cyan-300 px-4 py-3 text-sm font-bold text-[#07131b] shadow-lg shadow-cyan-500/15 hover:brightness-110">Start Song Guess</button> : <p className="mt-3 rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-center text-xs text-mist">Waiting for the room host. Song Guess needs 4–12 players.</p>}
      </div>}

      {game && <div className="mt-4 space-y-3">
        <audio ref={audioRef} preload="auto" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => onAudioFailed(game.gameId, game.roundToken)} />
        <div className="rounded-xl border border-white/10 bg-black/15 p-3">
          <div className="flex items-center gap-3">
            <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-cyan-300/10">{game.artworkUrl ? <img src={game.artworkUrl} alt="" className="h-full w-full object-cover" /> : <span className="text-2xl">♫</span>}</div>
            <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-white">{live || paused ? "Mystery track" : game.answer?.title || "Round complete"}</p><p className="truncate text-xs text-mist">{live || paused ? `${game.genre || "Audius track"} · listen closely` : game.answer ? `${game.answer.artist} · ${game.answer.source}` : "Preparing next round…"}</p></div>
            <button onClick={toggleAudio} className="rounded-lg bg-cyan-300 px-3 py-2 text-xs font-bold text-[#07131b]">{playing ? "Pause" : "Play"}</button>
          </div>
          {needsPlay && <button onClick={toggleAudio} className="mt-2 w-full rounded-lg border border-cyan-300/40 px-3 py-2 text-xs font-semibold text-cyan-100">Tap to play audio on this device</button>}
        </div>

        {live || paused ? <>
          <div className="flex items-center justify-between rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-3 py-2"><span className="text-xs text-cyan-100">Round {game.round} · {paused ? "paused" : "guess now"}</span><span className="font-mono text-lg font-bold text-white">{paused ? "Ⅱ" : `${secondsLeft}s`}</span></div>
          <div className="grid gap-2 sm:grid-cols-2">{(game.options || []).map((option) => <button key={option} disabled={!live || submitted.current.has(game.roundToken)} onClick={() => submit(option)} className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-left text-xs text-white transition hover:border-cyan-200/50 hover:bg-cyan-300/10 disabled:opacity-50">{option}</button>)}</div>
          <form onSubmit={(event) => { event.preventDefault(); submit(guess); }} className="flex gap-2"><input value={guess} onChange={(event) => setGuess(event.target.value)} disabled={!live || submitted.current.has(game.roundToken)} placeholder="Type title, title - artist, or artist - title" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white outline-none" /><button disabled={!live || !guess.trim()} className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-ink disabled:opacity-40">Submit</button></form>
          {isModerator && <div className="flex gap-2"><button onClick={() => onPause(paused ? "resume" : "pause")} className="flex-1 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white">{paused ? "Resume" : "Pause"}</button><button onClick={onEnd} className="rounded-lg border border-coral/30 px-3 py-2 text-xs font-semibold text-coral">End game</button></div>}
        </> : <div className="rounded-xl border border-white/10 bg-black/15 p-3 text-center"><p className="text-sm font-semibold text-white">{finished ? "Final leaderboard" : `Answer: ${game.answer?.title || "Unknown"}`}</p>{game.answer && <p className="mt-1 text-xs text-cyan-100">{game.answer.artist}</p>}{result && isModerator && <button onClick={onNext} className="mt-3 rounded-lg bg-cyan-300 px-3 py-2 text-xs font-bold text-[#07131b]">Next round</button>}{finished && isModerator && <button onClick={() => onRematch({ category, genre, rounds, timeLimit, difficulty, decade })} className="mt-3 rounded-lg bg-cyan-300 px-3 py-2 text-xs font-bold text-[#07131b]">Rematch</button>}</div>}
        {feedback && <p className="rounded-lg bg-white/5 px-3 py-2 text-xs text-cyan-100">{feedback}</p>}
        <div className="space-y-1.5">{(game.players || []).map((player, index) => <div key={`${player.socketId || player.displayName}-${index}`} className="flex items-center justify-between rounded-lg border border-white/5 bg-black/10 px-2.5 py-2 text-xs"><span className="truncate text-white/85"><span className="mr-2 text-mist">{index + 1}</span>{player.displayName}</span><span className="font-mono text-cyan-100">{player.score} pt{player.streak > 1 ? ` · ${player.streak}🔥` : ""}</span></div>)}</div>
      </div>}
      {error && <p className="mt-3 text-xs text-coral">{error}</p>}
    </section>
  );
}
