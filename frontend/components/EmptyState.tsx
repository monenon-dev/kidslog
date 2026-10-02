import type { LucideIcon } from "lucide-react";

type Props = {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  className?: string;
};

export function EmptyState({ icon: Icon, title, description, action, className = "" }: Props) {
  return (
    <div className={`flex flex-col items-center rounded-xl border border-dashed border-line bg-card/60 px-6 py-10 text-center ${className}`}>
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-brand-ink">
        <Icon size={22} strokeWidth={1.75} />
      </span>
      <p className="mt-3 font-semibold text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm break-keep text-sm text-ink-2">{description}</p>}
      {action && (
        <button type="button" className="btn-ghost mt-4" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
