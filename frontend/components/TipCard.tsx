import type { LucideIcon } from "lucide-react";

type Props = {
  title: string;
  items: { icon: LucideIcon; text: string }[];
  /** true면 항목 앞에 1. 2. 3. 순서를 붙인다 */
  numbered?: boolean;
  /** soft: 연한 앰버 카드(기본), plain: 다른 장식 패널 안에 넣을 때 쓰는 흰 반투명 카드 */
  tone?: "soft" | "plain";
  className?: string;
};

/** 온보딩·활용 팁용 옅은 앰버 카드 */
export function TipCard({ title, items, numbered = false, tone = "soft", className = "" }: Props) {
  const toneClass = tone === "soft" ? "border border-brand/20 bg-brand-soft" : "bg-card/80 backdrop-blur-sm";
  return (
    <section className={`rounded-xl px-5 py-4 ${toneClass} ${className}`}>
      <h2 className="text-sm font-semibold text-brand-ink">{title}</h2>
      <ol className="mt-3 space-y-2.5">
        {items.map(({ icon: Icon, text }, i) => (
          <li key={text} className="flex items-center gap-3 text-sm text-ink">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-brand ${tone === "soft" ? "bg-card shadow-[0_1px_2px_rgba(0,0,0,0.05)]" : "bg-brand-soft"}`}>
              <Icon size={16} strokeWidth={2} />
            </span>
            <span className="break-keep">
              {numbered && <span className="mr-1 font-semibold text-brand-ink">{i + 1}.</span>}
              {text}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
