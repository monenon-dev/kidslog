// 사용자 설정: 서버(/settings)에 저장하고, 화면 여러 곳에서 같은 값을 쓰도록 한 번만 불러 둔다.

import { useEffect, useState } from "react";
import { api } from "./api";

export type VideoDefaults = {
  font: string;
  size: "s" | "m" | "l";
  color: string;
  effect: "box" | "outline" | "shadow" | "plain";
  position: "bottom" | "middle" | "top";
  music: "none" | "bright" | "calm";
  max_sec: number;
};

export type NotifyPrefs = { analysis: boolean; low_photos: boolean; ai_limit: boolean; storage: boolean; retention: boolean };

export type UserPrefs = {
  photo_retention_days: 0 | 30 | 90 | 180 | 365;
  ai_enabled: boolean;
  blur_faces_default: boolean;
  ai_tone: "warm" | "concise";
  balance_days: 7 | 14 | 30;
  balance_ratio: number;
  video_defaults: VideoDefaults;
  notify: NotifyPrefs;
};

export const DEFAULT_PREFS: UserPrefs = {
  photo_retention_days: 0,
  ai_enabled: true,
  blur_faces_default: false,
  ai_tone: "warm",
  balance_days: 7,
  balance_ratio: 0.7,
  video_defaults: { font: "jua", size: "m", color: "#FFFFFF", effect: "box", position: "bottom", music: "bright", max_sec: 15 },
  notify: { analysis: true, low_photos: true, ai_limit: true, storage: true, retention: true },
};

let cache: UserPrefs | null = null;
let loading: Promise<UserPrefs> | null = null;
const listeners = new Set<(p: UserPrefs) => void>();

export function loadPrefs(): Promise<UserPrefs> {
  if (cache) return Promise.resolve(cache);
  loading ??= api<UserPrefs>("/settings")
    .then((p) => (cache = p))
    .catch(() => DEFAULT_PREFS)
    .finally(() => (loading = null));
  return loading;
}

export async function savePrefs(p: UserPrefs): Promise<UserPrefs> {
  const saved = await api<UserPrefs>("/settings", { method: "PUT", json: p });
  cache = saved;
  listeners.forEach((fn) => fn(saved));
  return saved;
}

/** 로그아웃·계정 삭제 뒤 다른 사람 설정이 남지 않게 */
export function forgetPrefs() {
  cache = null;
}

/** 설정을 아직 못 불러왔으면 null */
export function usePrefs(): UserPrefs | null {
  const [p, setP] = useState<UserPrefs | null>(cache);
  useEffect(() => {
    let alive = true;
    loadPrefs().then((x) => alive && setP(x));
    listeners.add(setP);
    return () => {
      alive = false;
      listeners.delete(setP);
    };
  }, []);
  return p;
}
