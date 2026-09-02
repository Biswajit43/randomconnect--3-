export default function PulseConnector({ label = "Finding someone…" }) {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-10">
      <div className="relative flex items-center justify-center w-40 h-16">
        {/* left node */}
        <div className="absolute left-0 w-10 h-10 rounded-full bg-signal/20 border border-signal flex items-center justify-center">
          <span className="w-3 h-3 rounded-full bg-signal animate-pulseRing" />
          <span className="absolute w-3 h-3 rounded-full bg-signal" />
        </div>

        {/* connecting line with traveling dash */}
        <svg className="absolute w-full h-4" viewBox="0 0 160 16" fill="none">
          <line x1="20" y1="8" x2="140" y2="8" stroke="#2A3154" strokeWidth="2" />
          <line
            x1="20"
            y1="8"
            x2="140"
            y2="8"
            stroke="#4CC9F0"
            strokeWidth="2"
            strokeDasharray="6 10"
            strokeLinecap="round"
          >
            <animate attributeName="stroke-dashoffset" from="0" to="-64" dur="1.2s" repeatCount="indefinite" />
          </line>
        </svg>

        {/* right node */}
        <div className="absolute right-0 w-10 h-10 rounded-full bg-violet/20 border border-violet flex items-center justify-center">
          <span className="w-3 h-3 rounded-full bg-violet animate-pulseRing" style={{ animationDelay: "0.6s" }} />
          <span className="absolute w-3 h-3 rounded-full bg-violet" />
        </div>
      </div>
      <p className="font-mono text-sm text-mist tracking-wide">{label}</p>
    </div>
  );
}
