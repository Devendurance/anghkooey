
function Sparkle({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 12 12" className={`lp-sparkle ${className}`} aria-hidden focusable="false">
      <path d="M6 0C6.4 4 8 5.6 12 6C8 6.4 6.4 8 6 12C5.6 8 4 6.4 0 6C4 5.6 5.6 4 6 0Z" fill="#F4EEDF" />
    </svg>
  );
}

function LinkedRings({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 110 26" className={className} aria-hidden focusable="false">
      {Array.from({ length: 7 }, (_, i) => (
        <circle key={i} cx={13 + i * 14} cy={13} r={12} fill="none" stroke="rgba(244,238,223,.55)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}

/** Printed-poster hairline ornament. Purely decorative. */
export function Ornaments() {
  return (
    <div className="lp-ornaments" data-ornaments aria-hidden>
      <span className={`lp-ring lp-ring-lg`} />
      <span className={`lp-ring lp-ring-md`} />
      <span className={`lp-ring lp-ring-sm`} />
      <LinkedRings className={`lp-linked lp-linked-l`} />
      <LinkedRings className={`lp-linked lp-linked-r`} />
      <Sparkle className="lp-spark-top" />
      <Sparkle className="lp-spark-left" />
      <Sparkle className="lp-spark-right" />
      <Sparkle className="lp-spark-bottom" />
      <span className={`t-label lp-numeral lp-numeral-l`}>01</span>
      <span className={`t-label lp-numeral lp-numeral-r`}>01</span>
      <span className={`t-label lp-vertical lp-vertical-l`}>Anghkooey means remember</span>
      <span className={`t-label lp-vertical lp-vertical-r`}>A personal AI concierge</span>
    </div>
  );
}
