import type { CSSProperties } from "react";

// Deterministic sparkle field so server and client markup match.
function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

type Spark = { x: number; y: number; size: number; dur: number; delay: number; warm: boolean };

const SPARKS: Spark[] = (() => {
  const r = rng(20261009);
  return Array.from({ length: 40 }, (_, i) => {
    // Most points drift along the lower-left glitter diagonal, a few in the sky.
    const t = r();
    const onBand = i % 5 !== 4;
    const x = onBand ? 4 + t * 70 : 18 + r() * 64;
    const y = onBand ? 92 - t * 34 + (r() - 0.5) * 16 : 14 + r() * 36;
    return {
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      size: Math.round((2 + r() * 2) * 10) / 10,
      dur: Math.round((2 + r() * 3) * 10) / 10,
      delay: Math.round(r() * 40) / 10,
      warm: r() > 0.3,
    };
  });
})();

/**
 * Atmospheric orb rendered with CSS layers only (no production orb video was supplied).
 * A remembered scene: high sky, drifting light, a warm hillside and glittering water.
 */
export function Orb() {
  return (
    <div className="lp-orb">
      <div className="lp-orb-mask">
        <div className="lp-scene">
          <div className="lp-sky" />
          <div className="lp-clouds" />
          <div className="lp-arc" />
          <div className="lp-hill" />
          <div className="lp-water" />
          <div className="lp-ember" />
          <div className="lp-sparks">
            {SPARKS.map((p, i) => (
              <span
                key={i}
                className={`lp-spark ${p.warm ? "lp-spark-warm" : "lp-spark-cool"}`}
                style={
                  {
                    left: `${p.x}%`,
                    top: `${p.y}%`,
                    width: `${p.size}px`,
                    height: `${p.size}px`,
                    "--dur": `${p.dur}s`,
                    "--delay": `-${p.delay}s`,
                  } as CSSProperties
                }
              />
            ))}
          </div>
        </div>
        <div className="lp-flare" />
        <div className="lp-vignette" />
      </div>
      <div className="lp-rim" />
    </div>
  );
}
