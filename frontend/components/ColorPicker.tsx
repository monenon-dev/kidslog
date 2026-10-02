"use client";

import { Palette } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Hsv = { h: number; s: number; v: number };

function hexToHsv(hex: string): Hsv {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
}

function hsvToHex({ h, s, v }: Hsv): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255);
  };
  return `#${[f(5), f(3), f(1)].map((x) => x.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

/**
 * 한 번 누르면 열리고 한 번 더 누르면 닫히는 색 고르기.
 * 브라우저 기본 색상 창은 다시 눌러도 닫히지 않아서 직접 만든다.
 * 스크롤 상자 안에서도 잘리지 않게 팝업이 아니라 바로 아래에 펼친다.
 */
export function ColorPicker({ value, onChange, disabled, iconColor }: { value: string; onChange: (hex: string) => void; disabled?: boolean; iconColor: string }) {
  const [open, setOpen] = useState(false);
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value));
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const svRef = useRef<HTMLDivElement>(null);

  // 바깥(빠른 색·코드 입력 등)에서 색이 바뀌면 맞춘다. 회색일 때 색조가 0으로 튀지 않게 h는 유지
  useEffect(() => {
    if (hsvToHex(hsv) === value.toUpperCase()) return;
    const next = hexToHsv(value);
    setHsv((cur) => ({ ...next, h: next.s === 0 ? cur.h : next.h }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    if (!open) return;
    // 다시 눌러 닫을 수 있게 색 상자 버튼이 스크롤 상자 맨 위에 보이도록
    btnRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  useEffect(() => void (disabled && setOpen(false)), [disabled]);

  const apply = (next: Hsv) => {
    setHsv(next);
    onChange(hsvToHex(next));
  };
  const pickSv = (e: React.PointerEvent) => {
    const r = svRef.current!.getBoundingClientRect();
    const s = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const v = 1 - Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    apply({ ...hsv, s, v });
  };

  return (
    <div ref={wrapRef} className="contents">
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`flex h-9 w-14 shrink-0 items-center justify-center rounded-lg border transition-shadow disabled:opacity-50 ${open ? "border-ink ring-2 ring-brand ring-offset-2" : "border-line"}`}
        style={{ background: value }}
        aria-expanded={open}
        aria-label={open ? "색 고르기 닫기" : "색 직접 고르기"}
        title={open ? "한 번 더 누르면 닫혀요" : "색 직접 고르기"}
      >
        <Palette size={16} color={iconColor} />
      </button>
      {open && (
        <div className="order-last w-full space-y-2 rounded-lg border border-line bg-card p-2">
          <div
            ref={svRef}
            className="relative h-24 cursor-crosshair touch-none rounded-md"
            style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h} 100% 50%))` }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              pickSv(e);
            }}
            onPointerMove={(e) => e.buttons && pickSv(e)}
            role="presentation"
          >
            <span
              className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
              style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: value }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={359}
            value={Math.round(hsv.h)}
            onChange={(e) => apply({ ...hsv, h: Number(e.target.value), s: hsv.s || 1, v: hsv.v || 1 })}
            className="hue-slider w-full"
            aria-label="색조"
          />
        </div>
      )}
    </div>
  );
}
