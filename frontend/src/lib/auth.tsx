"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import {
  AuthError,
  clearAuthToken,
  loginApi,
  logoutApi,
  meApi,
  registerApi,
  setAuthToken,
  updateProfileApi,
  type UserProfile,
} from "./api";

const TOKEN_KEY = "kanban-auth-token";

interface AuthContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  register: (params: {
    username: string;
    password: string;
    email?: string;
    display_name?: string;
  }) => Promise<{ ok: true } | { ok: false; message: string }>;
  logout: () => Promise<void>;
  updateProfile: (params: {
    display_name?: string;
    email?: string | null;
    current_password?: string;
    new_password?: string;
  }) => Promise<{ ok: true } | { ok: false; message: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
    if (!stored) {
      setLoading(false);
      return;
    }
    setAuthToken(stored);
    meApi()
      .then((u) => setUser(u))
      .catch((err) => {
        if (err instanceof AuthError) {
          clearAuthToken();
          localStorage.removeItem(TOKEN_KEY);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    try {
      const res = await loginApi(username, password);
      setAuthToken(res.token);
      localStorage.setItem(TOKEN_KEY, res.token);
      setUser(res.user);
      return true;
    } catch {
      clearAuthToken();
      return false;
    }
  }, []);

  const register = useCallback(
    async (params: { username: string; password: string; email?: string; display_name?: string }) => {
      try {
        const res = await registerApi(params);
        setAuthToken(res.token);
        localStorage.setItem(TOKEN_KEY, res.token);
        setUser(res.user);
        return { ok: true as const };
      } catch (err) {
        clearAuthToken();
        const message = err instanceof Error ? err.message : "Registration failed";
        return { ok: false as const, message };
      }
    },
    []
  );

  const updateProfile = useCallback(
    async (params: {
      display_name?: string;
      email?: string | null;
      current_password?: string;
      new_password?: string;
    }) => {
      try {
        const updated = await updateProfileApi(params);
        setUser(updated);
        return { ok: true as const };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Profile update failed";
        return { ok: false as const, message };
      }
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await logoutApi();
    } finally {
      clearAuthToken();
      localStorage.removeItem(TOKEN_KEY);
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: user !== null,
        loading,
        login,
        register,
        logout,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
