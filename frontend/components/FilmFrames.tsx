/** 장식용: 겹쳐진 사진 프레임과 필름 스트립. 특정 기관을 연상시키지 않는 추상 패턴. */
export function FilmFrames({ className = "w-full max-w-md" }: { className?: string }) {
  const holes = Array.from({ length: 9 }, (_, i) => 52 + i * 25);
  return (
    <svg viewBox="0 0 400 320" className={className} aria-hidden>
      {/* 뒤 프레임 */}
      <rect x="170" y="10" width="200" height="150" rx="14" className="fill-card stroke-line" strokeWidth="1.5" />
      <rect x="184" y="24" width="172" height="122" rx="8" className="fill-accent-soft" />
      <circle cx="320" cy="58" r="12" className="fill-accent/25" />
      <path d="M184 146 L240 96 L280 128 L310 104 L356 146 Z" className="fill-accent/20" />

      {/* 가운데 필름 스트립 */}
      <rect x="30" y="92" width="270" height="170" rx="14" className="fill-ink/85" />
      {holes.map((x) => (
        <g key={x}>
          <rect x={x - 10} y="102" width="12" height="9" rx="2" className="fill-paper/70" />
          <rect x={x - 10} y="243" width="12" height="9" rx="2" className="fill-paper/70" />
        </g>
      ))}
      <rect x="46" y="122" width="114" height="110" rx="6" className="fill-brand-soft" />
      <rect x="170" y="122" width="114" height="110" rx="6" className="fill-brand" />
      <circle cx="130" cy="152" r="10" className="fill-brand/60" />
      <path d="M46 232 L92 184 L124 210 L160 178 L160 232 Z" className="fill-brand/40" />
      <path d="M170 232 L210 192 L240 214 L284 170 L284 232 Z" className="fill-brand-hover" />

      {/* 앞 프레임 */}
      <rect x="236" y="196" width="150" height="112" rx="12" className="fill-card stroke-line" strokeWidth="1.5" />
      <rect x="248" y="208" width="126" height="88" rx="6" className="fill-paper" />
      <rect x="262" y="224" width="44" height="6" rx="3" className="fill-ink/15" />
      <rect x="262" y="238" width="72" height="6" rx="3" className="fill-ink/10" />
      <rect x="262" y="266" width="52" height="16" rx="8" className="fill-brand" />
    </svg>
  );
}
