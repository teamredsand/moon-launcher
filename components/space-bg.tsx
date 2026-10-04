/** Space background: pump.fun pills drift downward behind the page, so the
 * content reads as moving upward through space. Pure CSS animation, no JS. */

interface Particle {
  left: number; // vw
  size: number; // px
  opacity: number;
  duration: number; // s
  delay: number; // s (negative → spread over the full path at load)
  blur: number; // px
}

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1_664_525 + 1_013_904_223) % 2 ** 32;
    return s / 2 ** 32;
  };
}

function makeParticles(count: number): Particle[] {
  const rnd = seeded(20261004);
  const out: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const duration = 45 + rnd() * 75; // 45–120 s per full pass
    out.push({
      left: rnd() * 100,
      size: 14 + Math.round(rnd() * 34), // 14–48 px
      opacity: 0.07 + rnd() * 0.22, // 0.07–0.29
      duration,
      delay: -rnd() * duration,
      blur: rnd() < 0.3 ? 1 : 0,
    });
  }
  return out;
}

const PARTICLES = makeParticles(28);

export function SpaceBg() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      {PARTICLES.map((p, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={i}
          src="/pump-icon.png"
          alt=""
          className="space-particle absolute"
          style={{
            left: `${p.left}vw`,
            width: p.size,
            opacity: p.opacity,
            filter: p.blur ? `blur(${p.blur}px)` : undefined,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
