"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { SessionUser } from "@/lib/supabase/user";

type SessionContextValue = {
  user: SessionUser | null;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({
  initialUser,
  children,
}: {
  initialUser: SessionUser | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  // El servidor ya resolvió la sesión desde las cookies, así que el primer
  // HTML sale con el nombre puesto y el nav no parpadea al hidratar.
  const [user, setUser] = useState<SessionUser | null>(initialUser);

  // Ajuste en render, no en efecto: cuando el servidor vuelve a resolver la
  // sesión (navegación o router.refresh), su valor manda sobre el del cliente.
  const [lastInitial, setLastInitial] = useState(initialUser);
  if (initialUser !== lastInitial) {
    setLastInitial(initialUser);
    setUser(initialUser);
  }

  useEffect(() => {
    const supabase = createClient();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setUser(null);
        return;
      }
      // El nombre visible vive en profiles, no en el JWT: se consulta aparte.
      void supabase
        .from("profiles")
        .select("username")
        .eq("id", session.user.id)
        .single()
        .then(({ data }) => {
          setUser(
            data
              ? {
                  id: session.user.id,
                  name: data.username,
                  email: session.user.email || null,
                  isGuest: session.user.is_anonymous ?? false,
                }
              : null,
          );
        });
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    // Los componentes de servidor cachean initialUser: sin refresh, una ruta
    // ya renderizada seguiría pintando al usuario que acaba de salir.
    router.refresh();
  }, [router]);

  const value = useMemo(() => ({ user, signOut }), [user, signOut]);

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
