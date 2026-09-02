const COLORS = ["#4CC9F0", "#9D8DF1", "#FF6B6B", "#7BE0D6", "#F4B860", "#6FCF97"];

function colorFor(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}

export default function AvatarStack({ names = [], max = 3 }) {
  const shown = names.slice(0, max);
  const overflow = names.length - shown.length;

  return (
    <div className="flex items-center">
      {shown.map((name, i) => (
        <div
          key={i}
          style={{ backgroundColor: colorFor(name || String(i)), zIndex: max - i, marginLeft: i === 0 ? 0 : -10 }}
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-ink border-2 border-panel"
          title={name}
        >
          {(name || "?").charAt(0).toUpperCase()}
        </div>
      ))}
      {overflow > 0 && (
        <div
          style={{ marginLeft: -10 }}
          className="w-8 h-8 rounded-full bg-panel2 border-2 border-panel flex items-center justify-center text-xs font-semibold text-mist"
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}
