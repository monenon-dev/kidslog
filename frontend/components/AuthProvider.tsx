"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, refreshAccess, setAccessToken } from "@/lib/api";
import { DEMO_USER } from "@/lib/demo/data";
import { DEMO } from "@/lib/demo/flag";
import type { User } from "@/lib/types";

type AuthState = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  /** 프로필에서 이름을 바꿨을 때 화면 전체에 반영 */
  updateUser: (u: User) => void;
};

const AuthContext = createContext<AuthState | null>(null);

type TokenOut = { access_token: string; user: User };

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // 데모: 고정 사용자로 바로 로그인된 상태 (서버에 묻지 않음)
  const [user, setUser] = useState<User | null>(DEMO ? DEMO_USER : null);
  const [loading, setLoading] = useState(!DEMO);

  useEffect(() => {
    if (DEMO) return;
    (async () => {
      if (await refreshAccess()) {
        try {
          setUser(await api<User>("/auth/me"));
        } catch {}
      }
      setLoading(false);
    })();
  }, []);

  const accept = (t: TokenOut) => {
    setAccessToken(t.access_token);
    setUser(t.user);
  };

  const login = useCallback(async (email: string, password: string) => {
    if (DEMO) return;
    accept(await api<TokenOut>("/auth/login", { method: "POST", json: { email, password } }));
  }, []);

  const signup = useCallback(async (email: string, password: string, name: string) => {
    if (DEMO) return;
    accept(await api<TokenOut>("/auth/signup", { method: "POST", json: { email, password, name } }));
  }, []);

  const logout = useCallback(async () => {
    if (DEMO) return;
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    setAccessToken(null);
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, loading, login, signup, logout, updateUser: setUser }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
