"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";
import {
  getServerSessionSnapshot,
  getSessionSnapshot,
  normalizeName,
  subscribeSession,
  writeSession,
  type SessionUser,
} from "@/lib/session";

type SessionContextValue = {
  user: SessionUser | null;
  signIn: (name: string) => void;
  signOut: () => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  // El servidor y la primera hidratación ven null; React vuelve a leer
  // localStorage justo después, sin desajuste de hidratación.
  const user = useSyncExternalStore(
    subscribeSession,
    getSessionSnapshot,
    getServerSessionSnapshot,
  );

  const signIn = useCallback((name: string) => {
    writeSession({ name: normalizeName(name) });
  }, []);

  const signOut = useCallback(() => {
    writeSession(null);
  }, []);

  const value = useMemo(
    () => ({ user, signIn, signOut }),
    [user, signIn, signOut],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession debe usarse dentro de <SessionProvider>");
  }
  return ctx;
}
