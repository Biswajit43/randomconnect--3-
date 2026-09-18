import { useEffect, useMemo, useState } from "react"; 
 
const COLORS = { 
  red: { 
    name: "Red", 
    card: "border-red-300 bg-gradient-to-br from-red-400 to-red-600 text-white", 
    glow: "shadow-[0_0_30px_rgba(248,113,113,0.35)]", 
    soft: "border-red-300/30 bg-red-400/10 text-red-100", 
    dot: "bg-red-400", 
  }, 
  yellow: { 
    name: "Yellow", 
    card: "border-yellow-200 bg-gradient-to-br from-yellow-300 to-amber-500 text-slate-950", 
    glow: "shadow-[0_0_30px_rgba(250,204,21,0.30)]", 
    soft: "border-yellow-300/30 bg-yellow-300/10 text-yellow-100", 
    dot: "bg-yellow-300", 
  }, 
  green: { 
    name: "Green", 
    card: "border-emerald-300 bg-gradient-to-br from-emerald-400 to-green-600 text-white", 
    glow: "shadow-[0_0_30px_rgba(52,211,153,0.35)]", 
    soft: "border-emerald-300/30 bg-emerald-300/10 text-emerald-100", 
    dot: "bg-emerald-400", 
  }, 
  blue: { 
    name: "Blue", 
    card: "border-sky-300 bg-gradient-to-br from-sky-400 to-blue-600 text-white", 
    glow: "shadow-[0_0_30px_rgba(56,189,248,0.35)]", 
    soft: "border-sky-300/30 bg-sky-300/10 text-sky-100", 
    dot: "bg-sky-400", 
  }, 
}; 
 
const WILD_COLORS = ["red", "yellow", "green", "blue"]; 
 
function glyphFor(card) { 
  if (!card) return "?"; 
 
  switch (card.value) { 
    case "skip": 
      return "⊘"; 
    case "reverse": 
      return "⇄"; 
    case "draw2": 
      return "+2"; 
    case "wild": 
      return "★"; 
    case "wild4": 
      return "+4"; 
    default: 
      return card.value; 
  } 
} 
 
function cardName(card) { 
  if (!card) return "card"; 
  if (card.value === "skip") return "Skip"; 
  if (card.value === "reverse") return "Reverse"; 
  if (card.value === "draw2") return "Draw Two"; 
  if (card.value === "wild") return "Wild"; 
  if (card.value === "wild4") return "Wild Draw Four"; 
  return `${card.color} ${card.value}`; 
} 
 
function isPlayable(card, topCard, activeColor) { 
  if (!card || !topCard) return false; 
  if (card.color === "wild") return true; 
  return card.color === activeColor || card.value === topCard.value; 
} 
 
function CardFace({ 
  card, 
  playable = false, 
  disabled = false, 
  onClick, 
  small = false, 
  lifted = false, 
}) { 
  const isWild = card?.color === "wild"; 
  const palette = isWild 
    ? { 
        card: "border-white/80 bg-gradient-to-br from-red-500 via-yellow-400 via-emerald-500 to-blue-500 text-white", 
        glow: "shadow-[0_0_28px_rgba(255,255,255,0.25)]", 
      } 
    : COLORS[card?.color] || { 
        card: "border-white/30 bg-slate-700 text-white", 
        glow: "", 
      }; 
 
  const className = [ 
    "relative flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 font-black transition-all duration-150", 
    small ? "h-20 w-14" : "h-[7.2rem] w-[4.7rem] sm:h-[8rem] sm:w-[5.2rem]", 
    palette.card, 
    playable && !disabled 
      ? `${palette.glow} cursor-pointer hover:-translate-y-2 hover:scale-[1.04]` 
      : "", 
    !playable || disabled 
      ? "cursor-not-allowed opacity-35 saturate-[0.55]" 
      : "", 
    lifted ? "-translate-y-2 ring-2 ring-white/80" : "", 
  ].join(" "); 
 
  const content = ( 
    <> 
      <span className="absolute left-1.5 top-1 text-[10px] font-black opacity-90"> 
        {glyphFor(card)} 
      </span> 
 
      <span 
        className={[ 
          "absolute inset-[18%] rotate-[-10deg] rounded-[50%] bg-white/20", 
          "flex items-center justify-center", 
        ].join(" ")} 
      > 
        <span 
          className={[ 
            "rotate-[10deg] text-center font-black drop-shadow-md", 
            small ? "text-xl" : "text-3xl sm:text-4xl", 
          ].join(" ")} 
        > 
          {glyphFor(card)} 
        </span> 
      </span> 
 
      <span className="absolute bottom-1 right-1.5 text-[10px] font-black opacity-90"> 
        {glyphFor(card)} 
      </span> 
    </> 
  ); 
 
  if (!onClick) { 
    return <div className={className}>{content}</div>; 
  } 
 
  return ( 
    <button 
      type="button" 
      onClick={onClick} 
      disabled={disabled} 
      aria-label={`Play ${cardName(card)}`} 
      className={className} 
    > 
      {content} 
    </button> 
  ); 
} 
 
function CardBack({ small = false }) { 
  return ( 
    <div 
      className={[ 
        "relative shrink-0 overflow-hidden rounded-2xl border-2 border-white/90", 
        "bg-[#111827] shadow-lg", 
        small ? "h-16 w-11" : "h-[7.2rem] w-[4.7rem] sm:h-[8rem] sm:w-[5.2rem]", 
      ].join(" ")} 
    > 
      <div className="absolute inset-1 rounded-xl border border-white/25 bg-[repeating-linear-gradient(135deg,#111827_0px,#111827_4px,#1f2937_4px,#1f2937_7px)]" /> 
      <div className="absolute inset-0 flex items-center justify-center"> 
        <div className="rotate-[-12deg] rounded-xl border-2 border-white/70 bg-gradient-to-br from-red-500 via-yellow-400 via-emerald-500 to-blue-500 px-2 py-1 text-[10px] font-black text-white shadow-lg"> 
          LAST CARD 
        </div> 
      </div> 
    </div> 
  ); 
} 
 
function PlayerPill({ player, isTurn }) { 
  return ( 
    <div 
      className={[ 
        "rounded-full px-3 py-1.5 text-[11px] transition-all", 
        isTurn 
          ? "border border-emerald-300/50 bg-emerald-300/15 text-emerald-100 shadow-[0_0_18px_rgba(52,211,153,0.18)]" 
          : player.count === 1 
            ? "border border-amber-300/40 bg-amber-300/15 text-amber-100" 
            : "border border-white/10 bg-white/5 text-mist", 
      ].join(" ")} 
    > 
      <span className="font-semibold">{player.displayName}</span> 
      <span className="ml-1 opacity-80">· {player.count}</span> 
    </div> 
  ); 
} 
 
export default function UnoTable({ 
  game, 
  hand = [], 
  isMyTurn, 
  mustCall, 
  onAction, 
}) { 
  const [pendingWild, setPendingWild] = useState(null); 
  const [secondsLeft, setSecondsLeft] = useState(null); 
 
  useEffect(() => { 
    if (!game?.roundEndsAt) { 
      setSecondsLeft(null); 
      return undefined; 
    } 
 
    const update = () => { 
      setSecondsLeft( 
        Math.max( 
          0, 
          Math.ceil((game.roundEndsAt - Date.now()) / 1000) 
        ) 
      ); 
    }; 
 
    update(); 
 
    const timer = window.setInterval(update, 250); 
 
    return () => window.clearInterval(timer); 
  }, [game?.roundEndsAt, game?.unoTurnId]); 
 
  useEffect(() => { 
    setPendingWild(null); 
  }, [game?.gameId, game?.unoTurnId]); 
 
  const topCard = game?.unoTopCard || null; 
  const activeColor = game?.unoColor || topCard?.color || "blue"; 
 
  const sortedHand = useMemo( 
    () => 
      [...hand].sort((a, b) => { 
        const colorOrder = ["red", "yellow", "green", "blue", "wild"]; 
        const colorDiff = 
          colorOrder.indexOf(a.color) - colorOrder.indexOf(b.color); 
 
        if (colorDiff !== 0) return colorDiff; 
 
        return String(a.value).localeCompare(String(b.value)); 
      }), 
    [hand] 
  ); 
 
  const opponents = (game?.unoCounts || []).filter( 
    (player) => player.socketId !== game?.unoTurnId 
  ); 
 
  const turnName = game?.unoTurnName || "Someone"; 
  const lowTime = secondsLeft !== null && secondsLeft <= 5; 
 
  function handleCardClick(card) { 
    if (!isMyTurn) return; 
 
    if (!isPlayable(card, topCard, activeColor)) return; 
 
    if (card.color === "wild") { 
      setPendingWild(card.id); 
      return; 
    } 
 
    onAction("play", { cardId: card.id }); 
  } 
 
  function chooseWildColor(color) { 
    if (!pendingWild) return; 
 
    onAction("play", { 
      cardId: pendingWild, 
      chooseColor: color, 
    }); 
 
    setPendingWild(null); 
  } 
 
  return ( 
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-[#071c2d] via-[#10182a] to-[#101322] p-3 sm:p-4"> 
      {/* Decorative table glow */} 
      <div 
        className={`pointer-events-none absolute inset-x-6 top-20 h-40 rounded-full opacity-20 blur-3xl ${COLORS[activeColor]?.dot || "bg-white"}`} 
      /> 
 
      {/* TOP: Opponents */} 
      <div className="relative"> 
        <div className="mb-2 flex items-center justify-between"> 
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50"> 
            Players 
          </p> 
 
          <p className="text-[10px] text-white/40"> 
            {game?.unoCounts?.length || 0} players 
          </p> 
        </div> 
 
        <div className="flex min-h-20 items-center justify-center gap-1.5 overflow-hidden px-2"> 
          {opponents.map((player) => ( 
            <div 
              key={player.socketId} 
              className="flex min-w-0 flex-col items-center" 
            > 
              <div className="flex max-w-[5rem] -space-x-2"> 
                {Array.from({ 
                  length: Math.min(player.count, 5), 
                }).map((_, index) => ( 
                  <CardBack key={index} small /> 
                ))} 
              </div> 
 
              <span 
                className={[ 
                  "mt-1 max-w-[6rem] truncate text-[9px]", 
                  player.count === 1 
                    ? "font-bold text-amber-200" 
                    : "text-white/50", 
                ].join(" ")} 
              > 
                {player.displayName} 
              </span> 
 
              <span className="text-[9px] text-white/35"> 
                {player.count} cards 
              </span> 
            </div> 
          ))} 
        </div> 
      </div> 
 
      {/* TURN BANNER */} 
      <div className="relative mt-2 flex justify-center"> 
        <div 
          className={[ 
            "rounded-full border px-4 py-1.5 text-center", 
            isMyTurn 
              ? "border-emerald-300/60 bg-emerald-300/15 text-emerald-100 shadow-[0_0_22px_rgba(52,211,153,0.18)]" 
              : "border-white/10 bg-white/5 text-white/70", 
          ].join(" ")} 
        > 
          <span className="text-xs font-black"> 
            {isMyTurn ? "🟢 YOUR TURN" : `⏳ ${turnName}'s turn`} 
          </span> 
 
          {secondsLeft !== null && ( 
            <span 
              className={[ 
                "ml-2 text-[11px] font-mono", 
                lowTime ? "font-black text-red-300" : "text-white/50", 
              ].join(" ")} 
            > 
              {secondsLeft}s 
            </span> 
          )} 
        </div> 
      </div> 
 
      {/* TIMER */} 
      {secondsLeft !== null && ( 
        <div className="relative mx-auto mt-3 max-w-md"> 
          <div className="h-2 overflow-hidden rounded-full bg-white/10"> 
            <div 
              className={[ 
                "h-full rounded-full transition-all duration-300", 
                lowTime ? "bg-red-400" : "bg-emerald-300", 
              ].join(" ")} 
              style={{ 
                width: `${Math.min( 
                  100, 
                  Math.max(0, (secondsLeft / 30) * 100) 
                )}%`, 
              }} 
            /> 
          </div> 
        </div> 
      )} 
 
      {/* CENTER TABLE */} 
      <div className="relative mx-auto mt-5 flex max-w-xl items-center justify-center gap-5 sm:gap-8"> 
        {/* Draw pile */} 
        <div className="flex flex-col items-center"> 
          <button 
            type="button" 
            onClick={() => isMyTurn && onAction("draw")} 
            disabled={!isMyTurn} 
            className={[ 
              "relative transition-all", 
              isMyTurn 
                ? "cursor-pointer hover:-translate-y-1" 
                : "cursor-not-allowed opacity-70", 
            ].join(" ")} 
            aria-label="Draw a card" 
          > 
            <CardBack /> 
 
            <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] uppercase tracking-wider text-white/40"> 
              {game?.unoDeckCount ?? 0} left 
            </span> 
          </button> 
 
          <span className="mt-7 text-[9px] font-bold uppercase tracking-wider text-white/40"> 
            Draw 
          </span> 
        </div> 
 
        {/* Direction arrow */} 
        <div className="hidden text-2xl text-white/25 sm:block"> 
          {game?.unoDirection === 1 ? "→" : "←"} 
        </div> 
 
        {/* Discard pile */} 
        <div className="flex flex-col items-center"> 
          <div className="relative"> 
            <div 
              className={`absolute -inset-2 rounded-3xl blur-xl ${ 
                COLORS[activeColor]?.dot || "bg-white" 
              } opacity-20`} 
            /> 
 
            <CardFace card={topCard} /> 
          </div> 
 
          <div 
            className={[ 
              "mt-2 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wider", 
              COLORS[activeColor]?.soft || "border-white/10 bg-white/5 text-white", 
            ].join(" ")} 
          > 
            {COLORS[activeColor]?.name || activeColor} 
          </div> 
 
          <span className="mt-1 text-[9px] uppercase tracking-wider text-white/35"> 
            Current colour 
          </span> 
        </div> 
      </div> 
 
      {/* WHAT TO DO */} 
      <div 
        className={[ 
          "relative mx-auto mt-5 max-w-xl rounded-xl border p-3", 
          isMyTurn 
            ? COLORS[activeColor]?.soft || "border-white/10 bg-white/5" 
            : "border-white/10 bg-black/15", 
        ].join(" ")} 
      > 
        {isMyTurn ? ( 
          <> 
            <p className="text-center text-xs font-black text-white"> 
              Your move 
            </p> 
            <p className="mt-1 text-center text-[11px] text-white/65"> 
              Play a{" "} 
              <span className="font-bold text-white"> 
                {COLORS[activeColor]?.name || activeColor} 
              </span>{" "} 
              card or a matching number/symbol. 
            </p> 
          </> 
        ) : ( 
          <p className="text-center text-[11px] text-white/55"> 
            Watch the middle card. When it becomes your turn, play a matching 
            colour, number, symbol, or a Wild. 
          </p> 
        )} 
      </div> 
 
      {/* PLAYER COUNT PILLS */} 
      <div className="relative mt-3 flex flex-wrap justify-center gap-1.5"> 
        {(game?.unoCounts || []).map((player) => ( 
          <PlayerPill 
            key={player.socketId} 
            player={player} 
            isTurn={player.socketId === game?.unoTurnId} 
          /> 
        ))} 
      </div> 
 
      {/* WILD COLOR PICKER */} 
      {pendingWild && ( 
        <div className="relative mx-auto mt-4 max-w-md rounded-2xl border border-white/15 bg-black/30 p-3 text-center shadow-xl backdrop-blur"> 
          <p className="text-xs font-black text-white"> 
            🌈 CHOOSE THE NEXT COLOUR 
          </p> 
 
          <div className="mt-3 grid grid-cols-4 gap-2"> 
            {WILD_COLORS.map((color) => ( 
              <button 
                key={color} 
                type="button" 
                onClick={() => chooseWildColor(color)} 
                className={[ 
                  "rounded-xl border-2 px-2 py-2 text-[11px] font-black transition-all", 
                  "hover:-translate-y-0.5 hover:scale-[1.03]", 
                  COLORS[color].card, 
                ].join(" ")} 
              > 
                {COLORS[color].name} 
              </button> 
            ))} 
          </div> 
 
          <button 
            type="button" 
            onClick={() => setPendingWild(null)} 
            className="mt-2 text-[10px] text-white/40 hover:text-white" 
          > 
            Cancel 
          </button> 
        </div> 
      )} 
 
      {/* UNO / LAST CARD WARNING */} 
      {mustCall && ( 
        <div className="relative mx-auto mt-4 max-w-md animate-pulse rounded-2xl border-2 border-amber-300 bg-amber-300/15 p-3 text-center shadow-[0_0_30px_rgba(251,191,36,0.22)]"> 
          <p className="text-sm font-black text-amber-100"> 
            🚨 ONE CARD LEFT! 
          </p> 
 
          <button 
            type="button" 
            onClick={() => onAction("call-uno")} 
            className="mt-2 rounded-xl bg-amber-300 px-5 py-2.5 text-sm font-black text-slate-950 shadow-lg hover:brightness-110" 
          > 
            CALL LAST CARD! 
          </button> 
        </div> 
      )} 
 
      {/* YOUR HAND */} 
      <div className="relative mt-6"> 
        <div className="mb-2 flex items-center justify-between px-1"> 
          <div> 
            <p className="text-xs font-black uppercase tracking-[0.18em] text-white"> 
              Your hand 
            </p> 
            <p className="mt-0.5 text-[10px] text-white/40"> 
              {hand.length} card{hand.length === 1 ? "" : "s"} 
            </p> 
          </div> 
 
          {isMyTurn && ( 
            <span className="rounded-full bg-emerald-300/15 px-2.5 py-1 text-[10px] font-bold text-emerald-100"> 
              Tap a bright card 
            </span> 
          )} 
        </div> 
 
        <div className="flex min-h-[10rem] items-end justify-center overflow-x-auto px-3 pb-4 pt-3"> 
          <div className="flex items-end"> 
            {sortedHand.map((card, index) => { 
              const playable = 
                isMyTurn && isPlayable(card, topCard, activeColor); 
 
              return ( 
                <div 
                  key={card.id} 
                  className="-ml-2 first:ml-0" 
                  style={{ 
                    zIndex: index, 
                  }} 
                > 
                  <CardFace 
                    card={card} 
                    playable={playable} 
                    disabled={!playable} 
                    onClick={() => handleCardClick(card)} 
                    lifted={pendingWild === card.id} 
                  /> 
                </div> 
              ); 
            })} 
          </div> 
        </div> 
      </div> 
 
      {/* BEGINNER LEGEND */} 
      <div className="relative mt-2 rounded-2xl border border-white/10 bg-black/20 p-3"> 
        <p className="text-center text-[10px] font-black uppercase tracking-[0.16em] text-white/60"> 
          How to play 
        </p> 
 
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4"> 
          <RuleChip icon="🎨" text="Match colour" /> 
          <RuleChip icon="🔢" text="Match number" /> 
          <RuleChip icon="⭐" text="Wild = any colour" /> 
          <RuleChip icon="🚨" text="1 card = Call!" /> 
        </div> 
 
        <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[9px] text-white/45"> 
          <span>⊘ Skip</span> 
          <span>⇄ Reverse</span> 
          <span>+2 Draw Two</span> 
          <span>+4 Wild Draw Four</span> 
        </div> 
      </div> 
 
      {/* DRAW BUTTON */} 
      <button 
        type="button" 
        onClick={() => onAction("draw")} 
        disabled={!isMyTurn} 
        className={[ 
          "relative mx-auto mt-3 block rounded-xl border px-6 py-2.5 text-xs font-bold transition-all", 
          isMyTurn 
            ? "border-white/20 bg-white/10 text-white hover:bg-white/15" 
            : "cursor-not-allowed border-white/10 bg-white/5 text-white/30", 
        ].join(" ")} 
      > 
        🃏 Draw a card 
      </button> 
    </div> 
  ); 
} 
 
function RuleChip({ icon, text }) { 
  return ( 
    <div className="rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-center"> 
      <div className="text-sm">{icon}</div> 
      <p className="mt-0.5 text-[9px] font-semibold text-white/65"> 
        {text} 
      </p> 
    </div> 
  ); 
}