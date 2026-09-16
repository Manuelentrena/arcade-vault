export type SessionUser = {
  /** Siempre en mayúsculas y recortado a 10 caracteres. */
  name: string;
};

export const SESSION_KEY = "av_user";

/** Aplica el invariante del nombre: mayúsculas, sin espacios sobrantes, máx. 10. */
export function normalizeName(name: string): string {
  return name.trim().toUpperCase().slice(0, 10);
}

function parseSession(raw: string | null): SessionUser | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as SessionUser).name !== "string"
    ) {
      return null;
    }
    const name = normalizeName((parsed as SessionUser).name);
    return name ? { name } : null;
  } catch {
    return null;
  }
}

function readRaw(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    // localStorage bloqueado (modo privado, cookies de terceros).
    return null;
  }
}

/**
 * Lee la sesión falsa de localStorage.
 * Devuelve null si no hay nada, si el JSON está corrupto o si localStorage
 * está bloqueado.
 */
export function readSession(): SessionUser | null {
  return parseSession(readRaw());
}

/** Guarda la sesión falsa y avisa a los suscriptores. Pasar null borra la clave. */
export function writeSession(user: SessionUser | null): void {
  try {
    if (user) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  } catch {
    // Sin persistencia: la aplicación sigue funcionando, simplemente no recuerda.
  }
  emit();
}

/* ===== store externo para useSyncExternalStore ===== */

const listeners = new Set<() => void>();
let lastRaw: string | null = null;
let cached: SessionUser | null = null;

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeSession(onChange: () => void): () => void {
  listeners.add(onChange);
  // Mantiene sincronizadas las demás pestañas.
  window.addEventListener("storage", emit);
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) window.removeEventListener("storage", emit);
  };
}

/**
 * Snapshot del cliente. Cachea por el texto crudo para devolver siempre la
 * misma referencia mientras localStorage no cambie: useSyncExternalStore
 * entra en bucle si el snapshot cambia de identidad en cada lectura.
 */
export function getSessionSnapshot(): SessionUser | null {
  const raw = readRaw();
  if (raw !== lastRaw) {
    lastRaw = raw;
    cached = parseSession(raw);
  }
  return cached;
}

/** En el servidor no hay sesión: el primer HTML siempre sale desconectado. */
export function getServerSessionSnapshot(): SessionUser | null {
  return null;
}
