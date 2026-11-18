import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { get, getToken, post, setToken, setUnauthorizedHandler } from "./api";
import type { ClubRef, Permission, User } from "./types";

interface AuthState {
  status: "loading" | "anonymous" | "authenticated";
  user: User | null;
  clubs: ClubRef[];
  club: ClubRef | null;
  selectClub: (id: string) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { name: string; email: string; password: string; phone?: string; nickname?: string }) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  can: (p: Permission) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);
const CLUB_KEY = "varzea.club";

const readClub = () => {
  try {
    return localStorage.getItem(CLUB_KEY);
  } catch {
    return null;
  }
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState["status"]>(getToken() ? "loading" : "anonymous");
  const [user, setUser] = useState<User | null>(null);
  const [clubs, setClubs] = useState<ClubRef[]>([]);
  const [clubId, setClubId] = useState<string | null>(readClub());

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setClubs([]);
    setStatus("anonymous");
  }, []);

  const refresh = useCallback(async () => {
    if (!getToken()) return logout();
    try {
      const me = await get<{ user: User; clubs: ClubRef[] }>("/auth/me");
      setUser(me.user);
      setClubs(me.clubs);
      setStatus("authenticated");
    } catch {
      logout();
    }
  }, [logout]);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (getToken()) void refresh();
  }, [logout, refresh]);

  const selectClub = useCallback((id: string) => {
    setClubId(id);
    try {
      localStorage.setItem(CLUB_KEY, id);
    } catch {
      /* ignora */
    }
  }, []);

  const value = useMemo<AuthState>(() => {
    const club = clubs.find((c) => c.id === clubId) ?? clubs[0] ?? null;
    return {
      status,
      user,
      clubs,
      club,
      selectClub,
      logout,
      refresh,
      can: (p) => Boolean(club?.permissions.includes(p)),
      login: async (email, password) => {
        const res = await post<{ token: string }>("/auth/login", { email, password });
        setToken(res.token);
        await refresh();
      },
      register: async (data) => {
        const res = await post<{ token: string }>("/auth/register", data);
        setToken(res.token);
        await refresh();
      },
    };
  }, [status, user, clubs, clubId, selectClub, logout, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth fora do AuthProvider");
  return ctx;
}
