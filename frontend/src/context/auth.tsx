import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { apiClient, getToken, setToken } from "../lib/api";

interface AuthCtx {
  token: string | null;
  login: (password: string) => Promise<void>;
  logout: () => void;
  ready: boolean;
}

const Ctx = createContext<AuthCtx>({ token: null, login: async () => {}, logout: () => {}, ready: false });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setT] = useState<string | null>(getToken());
  const [ready, setReady] = useState(true);

  const login = async (password: string) => {
    const res = await apiClient.login(password);
    setToken(res.token);
    setT(res.token);
  };

  const logout = () => {
    setToken(null);
    setT(null);
  };

  return <Ctx.Provider value={{ token, login, logout, ready }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);