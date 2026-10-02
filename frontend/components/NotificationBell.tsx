"use client";

import { Bell, CheckCheck, Clapperboard, Images, Settings, Trash2, TriangleAlert, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

type Item = { id: number; kind: string; title: string; body: string; link: string; created_at: string; read: boolean };
type List = { items: Item[]; unread: number };

const ICONS: Record<string, LucideIcon> = {
  analysis: Images,
  low_photos: Users,
  ai_limit: TriangleAlert,
  storage: Clapperboard,
  retention: Trash2,
};

function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "방금";
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return new Date(iso).toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}

/** 헤더의 알림 종: 1분마다 새 알림을 확인한다 */
export function NotificationBell() {
  const router = useRouter();
  const [data, setData] = useState<List | null>(null);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    api<List>("/notifications").then(setData).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    window.addEventListener("kidslog:notify", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("kidslog:notify", onFocus);
    };
  }, [load]);

  // 바깥을 누르거나 Esc로 닫기
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  async function go(n: Item) {
    if (!n.read) await api(`/notifications/${n.id}/read`, { method: "POST" }).catch(() => {});
    setOpen(false);
    load();
    if (n.link) router.push(n.link);
  }

  const unread = data?.unread ?? 0;
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-paper hover:text-ink"
        aria-label={unread ? `알림 ${unread}개 안 읽음` : "알림"}
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
          if (!open) load();
        }}
      >
        <Bell size={19} />
        {unread > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-bad px-1 text-[10px] font-bold leading-none text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-30 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-line bg-card shadow-[0_12px_32px_rgba(0,0,0,0.14)]">
          <div className="flex items-center gap-2 border-b border-line px-4 py-3">
            <span className="font-semibold">알림</span>
            {unread > 0 && (
              <button
                type="button"
                className="ml-auto inline-flex items-center gap-1 text-xs text-ink-2 hover:text-ink"
                onClick={async () => {
                  await api("/notifications/read-all", { method: "POST" }).catch(() => {});
                  load();
                }}
              >
                <CheckCheck size={14} /> 모두 읽음
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {!data?.items.length && <li className="px-4 py-8 text-center text-sm text-ink-3">새 알림이 없어요</li>}
            {data?.items.map((n) => {
              const Icon = ICONS[n.kind] ?? Bell;
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => go(n)}
                    className={`flex w-full gap-3 border-b border-line/60 px-4 py-3 text-left transition-colors hover:bg-paper ${n.read ? "" : "bg-brand-soft/40"}`}
                  >
                    <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${n.kind === "ai_limit" ? "bg-warn-soft text-warn" : "bg-brand-soft text-brand-ink"}`}>
                      <Icon size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className={`min-w-0 flex-1 text-sm ${n.read ? "text-ink-2" : "font-semibold text-ink"}`}>{n.title}</span>
                        <span className="shrink-0 text-[11px] text-ink-3">{ago(n.created_at)}</span>
                      </span>
                      {n.body && <span className="mt-0.5 block break-keep text-xs text-ink-2">{n.body}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <Link
            href="/profile?tab=notify"
            onClick={() => setOpen(false)}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-medium text-ink-2 hover:bg-paper hover:text-ink"
          >
            <Settings size={13} /> 알림 설정
          </Link>
        </div>
      )}
    </div>
  );
}
