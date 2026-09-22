/**
 * La sesión tal y como la ven los componentes, sin nada de servidor dentro.
 *
 * Vive separado de `session.ts` a propósito: ese módulo importa `server.ts`, que
 * importa `next/headers`, y cualquier componente de cliente que trajera de ahí
 * un valor en tiempo de ejecución rompería el build.
 */

export type SessionUser = {
  id: string;
  /** profiles.username: mayúsculas, 2-10 caracteres, único. */
  name: string;
  email: string | null;
  /** Sesión anónima: el claim is_anonymous del JWT. */
  isGuest: boolean;
};

/**
 * El nombre que se pinta. A un invitado el trigger le asigna un username
 * técnico (`INV70A7E1D`) que no es un nombre de jugador y no se enseña: la
 * regla vive aquí para que los tres sitios que pintan el nombre no repitan
 * el condicional.
 */
export function displayName(user: SessionUser): string {
  return user.isGuest ? "INVITADO" : user.name;
}
