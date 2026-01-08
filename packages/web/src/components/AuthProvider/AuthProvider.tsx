"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { getDevSettings } from "@/lib/api";

export type UserRole = "admin" | "user";

interface User {
  id: string;
  email: string | null;
  role: UserRole;
  createdAt: string;
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Check if auth bypass is enabled for testing/development.
 * Enable by setting a cookie:
 *   document.cookie = 'BYPASS_AUTH=admin'  // bypass as admin
 *   document.cookie = 'BYPASS_AUTH=user'   // bypass as regular user
 *
 * The middleware (proxy.ts) also checks this cookie to skip redirect.
 */
function getBypassAuth(): User | null {
  if (typeof window === "undefined") return null;

  // Check cookie
  const cookies = document.cookie.split(";").reduce(
    (acc, c) => {
      const [key, val] = c.trim().split("=");
      acc[key] = val;
      return acc;
    },
    {} as Record<string, string>
  );

  const bypass = cookies["BYPASS_AUTH"];
  if (bypass === "admin") {
    return {
      id: "test-user-id",
      email: "test@example.com",
      role: "admin",
      createdAt: new Date().toISOString(),
    };
  }
  if (bypass === "user") {
    return {
      id: "test-user-id",
      email: "test@example.com",
      role: "user",
      createdAt: new Date().toISOString(),
    };
  }
  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    // Check for auth bypass first (for testing/Playwright)
    const bypassUser = getBypassAuth();
    if (bypassUser) {
      setUser(bypassUser);
      setIsLoading(false);
      return;
    }

    try {
      const settings = getDevSettings();
      const response = await fetch(`${settings.apiBaseUrl}/auth/me`, {
        credentials: "include",
      });
      const data = await response.json();

      if (data.ok && data.user) {
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      const settings = getDevSettings();
      await fetch(`${settings.apiBaseUrl}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } finally {
      setUser(null);
      // Force redirect to login
      window.location.href = "/login";
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

export function useUser() {
  const { user } = useAuth();
  return user;
}

export function useIsAuthenticated() {
  const { isAuthenticated, isLoading } = useAuth();
  return { isAuthenticated, isLoading };
}

export function useIsAdmin() {
  const { user } = useAuth();
  return user?.role === "admin";
}
