"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { loginApi, setAuthCredentials, clearAuthCredentials } from "./api";

interface AuthContextType {
  isAuthenticated: boolean;
  userId: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const storedUserId = localStorage.getItem("kanban-user-id");
    const storedCreds = localStorage.getItem("kanban-auth-creds");
    if (storedUserId && storedCreds) {
      setAuthCredentials(storedCreds);
      setIsAuthenticated(true);
      setUserId(storedUserId);
    }
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      const creds = btoa(`${username}:${password}`);
      setAuthCredentials(creds);
      const data = await loginApi(username, password);
      setIsAuthenticated(true);
      setUserId(data.id);
      localStorage.setItem("kanban-user-id", data.id);
      localStorage.setItem("kanban-auth-creds", creds);
      return true;
    } catch {
      clearAuthCredentials();
      return false;
    }
  };

  const logout = () => {
    setIsAuthenticated(false);
    setUserId(null);
    clearAuthCredentials();
    localStorage.removeItem("kanban-user-id");
    localStorage.removeItem("kanban-auth-creds");
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, userId, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
