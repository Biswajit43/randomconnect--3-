import { useEffect, useMemo, useState } from "react";

const WILD_COLORS = ["red", "yellow", "green", "blue"];

const CARD_SKIN = {
  red: "border-red-400/70 bg-red-500/25 text-red-100",
  yellow: "border-amber-300/70 bg-amber-300/25 text-amber-100",
  green: "border-emerald-400/70 bg-emerald-500/25 text-emerald-100",
  blue: "border-sky-400/70 bg-sky-500/25 text-sky-100",
  wild: "border-white/50 bg-gradient-to-br from-red-500/30 via-emerald-500/30 to-sky-500/30 text-white",
};

function glyphFor(card) {
  if (!card) return "?";
  switch (card.value) {
    case "skip": return "⊘";
    case "reverse": return "⇄";
    case "draw2": return "+2";
    case "wild": return "★";
    case "wild4": return "+4";
    default: return card.value;
  }
}

function isPlayable(card, topCard, activeColor) {
  if (!card || !topCard) return false;
  if (card.color === "wild") return true;
  return card.color === activeColor || card.value === topCard.value;
}

function UnoCard({ card, size = "md", playable = true, onClick, selected = false }) {
  const skin = CARD_SKIN[card.color] || CARD_SKIN.wild;
  const isLg = size === "lg";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick || !playable}
      style={isLg ? { width: "5.5rem" } : undefined}
      className={[
        isLg ? "h-32 w-22" : "h-16 w-11",
        "relative flex flex-col items-center justify-center rounded-xl border-2 font-black transition-all",
        skin,
        onClick && playable ? "cursor-pointer hover:-translate-y-2 hover:shadow-lg hover:shadow-black/40" : "",
        onClick && !playable ? "cursor-not-allowed opacity-35 grayscale" : "",
        selected ? "-translate-y-2 ring-2 ring-white" : "",
      ].join(" ")}
    >
      <span className={isLg ? "text-2xl" : "text-sm"}>{glyphFor(card)}</span>
    </button>
  );
}

export default function UnoTable({ game, hand = [], isMyTurn, mustCall, onAction }) {
  const [pendingWild, setPendingWild] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(null);

  useEffect(() => {
    if (!game?.roundEndsAt) { setSecondsLeft(null); return; }
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((game.roundEndsAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [game?.roundEndsAt, game?.unoTurnId]);

  const topCard = game?.unoTopCard;
  const activeColor = game?.unoColor;

  const sortedHand = useMemo(
    () => [...hand].sort((a, b) => (a.color !== b.color ? a.color.localeCompare(b.color) : String(a.value).localeCompare(String(b.value)))),
    [hand]
  );

  function handleCardClick(card) {
    if (!isMyTurn) return;
    if (card.color === "wild") { setPendingWild(card.id); return; }
    onAction("play", { cardId: card.id });
  }

  function chooseWildColor(color) {
    if (!pendingWild) return;
    onAction("play", { cardId: pendingWild, chooseColor: color });
    setPendingWild(null);
  }

  const low = secondsLeft !== null && secondsLeft <= 5;

  return (
    <div className="w-full">
      {secondsLeft !== null && (
        <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full transition-all duration-300 ${low ? "bg-orange-400" : "bg-emerald-300"}`}
            style={{ width: `${Math.min(100, (secondsLeft / 30) * 100)}%` }}
          />
        </div>
      )}

      <div className="flex items-center justify-center gap-4">
        <div className="flex flex-col items-center gap-1">
          <div
            style={{ width: "5.5rem" }}
            className={`flex h-32 items-center justify-center rounded-2xl border-2 shadow-lg ${CARD_SKIN[activeColor] || CARD_SKIN.wild}`}
          >
            <span className="text-3xl font-black">{glyphFor(topCard)}</span>
          </div>
          <span className="text-[10px] uppercase tracking-wide text-mist">{game?.unoDeckCount ?? 0} in deck</span>
        </div>
        <div className="text-left text-[11px] text-mist">
          <p>Colour: <span className="font-bold text-white capitalize">{activeColor}</span></p>
          <p>{game?.unoDirection === 1 ? "↻ clockwise" : "↺ anticlockwise"}</p>
          <p className="mt-1 text-white">
            {isMyTurn ? "Your turn" : `${game?.unoTurnName || "Someone"}'s turn`}
            {secondsLeft !== null && <span className={low ? "ml-1 text-orange-300" : "ml-1"}> · {secondsLeft}s</span>}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap justify-center gap-1.5">
        {(game?.unoCounts || []).map((p) => (
          <span
            key={p.socketId}
            className={`rounded-full px-2 py-1 text-[10px] ${
              p.count === 1
                ? "bg-amber-300/25 text-amber-100"
                : p.socketId === game?.unoTurnId
                ? "bg-emerald-300/20 text-emerald-100"
                : "bg-white/5 text-mist"
            }`}
          >
            {p.displayName} · {p.count}
          </span>
        ))}
      </div>

      {mustCall && (
        <button
          type="button"
          onClick={() => onAction("call-uno")}
          className="mx-auto mt-3 block w-full max-w-xs animate-pulse rounded-lg bg-amber-300 px-3 py-2 text-sm font-black text-ink"
        >
          CALL LAST CARD!
        </button>
      )}

      {pendingWild && (
        <div className="mt-3 flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
          <span className="text-[11px] text-mist">Pick a colour:</span>
          {WILD_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => chooseWildColor(c)}
              className="h-6 w-6 rounded-full border-2 border-white/40 transition hover:scale-110"
              style={{ backgroundColor: c }}
              aria-label={c}
            />
          ))}
          <button type="button" onClick={() => setPendingWild(null)} className="ml-1 text-[11px] text-mist hover:text-white">
            cancel
          </button>
        </div>
      )}

      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {sortedHand.map((card) => (
          <UnoCard
            key={card.id}
            card={card}
            size="lg"
            playable={isMyTurn && isPlayable(card, topCard, activeColor)}
            onClick={() => handleCardClick(card)}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => onAction("draw")}
        disabled={!isMyTurn}
        className="mx-auto mt-3 block rounded-lg border border-white/15 px-3 py-2 text-xs text-white hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Draw a card
      </button>
    </div>
  );
}