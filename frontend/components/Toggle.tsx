"use client";

/** 켜기/끄기 스위치. 라벨·설명을 같이 주면 줄 전체를 눌러도 바뀐다. */
export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
  size = "md",
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  const sw = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={typeof label === "string" ? label : undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50 ${
        size === "sm" ? "h-5 w-9" : "h-6 w-11"
      } ${checked ? "bg-brand" : "bg-line"}`}
    >
      <span
        aria-hidden
        className={`inline-block rounded-full bg-white shadow transition-transform duration-200 ${size === "sm" ? "h-4 w-4" : "h-5 w-5"} ${
          checked ? (size === "sm" ? "translate-x-[18px]" : "translate-x-[22px]") : "translate-x-0.5"
        }`}
      />
    </button>
  );
  if (!label) return sw;
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1 cursor-pointer select-none" onClick={() => !disabled && onChange(!checked)}>
        <div className="text-sm font-medium text-ink">{label}</div>
        {description && <div className="mt-0.5 break-keep text-xs text-ink-2">{description}</div>}
      </div>
      {sw}
    </div>
  );
}
