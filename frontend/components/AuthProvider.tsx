"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, refreshAccess, setAccessToken } from "@/lib/api";
import type { User } from "@/lib/types";

type AuthState = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

type TokenOut = { access_token: string; user: User };

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
    accept(await api<TokenOut>("/auth/login", { method: "POST", json: { email, password } }));
  }, []);

  const signup = useCallback(async (email: string, password: string, name: string) => {
    accept(await api<TokenOut>("/auth/signup", { method: "POST", json: { email, password, name } }));
  }, []);

  const logout = useCallback(async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    setAccessToken(null);
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, loading, login, signup, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
