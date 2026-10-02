"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** 설정은 프로필 화면 안으로 옮겼다. 예전 링크(/settings, /settings#notify)는 그쪽으로 보낸다. */
export default function SettingsRedirect() {
  const router = useRouter();
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const ok = ["privacy", "video", "work", "notify", "danger"];
    router.replace(`/profile?tab=${ok.includes(hash) ? hash : "privacy"}`);
  }, [router]);
  return <p className="p-10 text-center text-sm text-ink-3">설정으로 이동하는 중…</p>;
}
