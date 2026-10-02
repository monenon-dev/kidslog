"use client";

/** 여러 개 중 하나 고르기 (붙어 있는 버튼 묶음) */
export function Segmented<T extends string>({ value, options, onChange, disabled }: { value: T; options: readonly { id: T; label: string }[]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div className="flex rounded-lg border border-line p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          disabled={disabled}
          onClick={() => onChange(o.id)}
          className={`flex-1 rounded-md px-2 py-1 text-sm transition-colors ${value === o.id ? "bg-brand-soft font-semibold text-brand-ink" : "text-ink-2 hover:bg-paper"}`}
          aria-pressed={value === o.id}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
