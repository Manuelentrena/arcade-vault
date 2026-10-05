# SPEC 30 — Checklist básico de seguridad: contraseñas, límite de signup y cabeceras HTTP

> **Estado:** Implementado
> **Depende de:** SPEC 16 (tablas Supabase de juegos y puntuaciones — RLS ya habilitado ahí), SPEC 29 (cierre del bypass de RLS en `scores` y token de sesión de partida)
> **Versión:** Fix
> **Fecha:** 2026-10-05
> **Objetivo:** Cierra los puntos pendientes de un checklist básico de seguridad — mínimo de contraseña, protección de contraseñas filtradas, límite de signups por IP y cabeceras HTTP — dejando constancia de que RLS en `games` y `scores` ya estaba satisfecho.

## Por qué existe esta spec

El usuario trajo un checklist de cinco puntos. Al auditar el repo antes de preguntar, cuatro de los cinco resultan ser configuración pendiente y uno ya está cerrado:

- **RLS en `games` y `scores`:** ya habilitado desde `supabase/migrations/20260927082152_catalogo_juegos_y_puntuaciones.sql` (SPEC 16), y la política de `insert` insegura que SPEC 29 identificó y retiró en `20261002130000_retira_policy_insert_scores.sql` ya no existe. Nada que hacer aquí salvo documentarlo.
- **Minimum password length:** `supabase/config.toml` tiene `minimum_password_length = 6`, el checklist pide 8.
- **Leaked password protection:** no existe clave equivalente en `config.toml` para el stack local autoalojado — es un toggle exclusivo del panel del proyecto remoto (Authentication → Policies → Password), mismo patrón que `enable_anonymous_sign_ins` o `[auth.captcha]` ya documentado en `README.md`.
- **Max signup rate:** `sign_in_sign_ups` en `config.toml` está en 1000, pero a propósito — el comentario explica que la suite de Playwright corre en paralelo (`workers: 2`) contra la misma IP y un valor bajo la deja colgada a mitad de ejecución. El valor real de producción es, igual que el anterior, un ajuste manual en el proyecto remoto.
- **Headers de seguridad:** `next.config.ts` no declara `headers()` en absoluto.

## Scope

**Dentro:**

- Verificar y documentar que RLS ya está habilitado en `public.games` y `public.scores`, sin cambios de código ni de migraciones.
- Subir `minimum_password_length` de 6 a 8 en `supabase/config.toml` (stack local).
- Documentar en `README.md`, junto a los demás toggles manuales del proyecto remoto, tres pasos a mano en el panel de Supabase:
  1. Authentication → Policies → Password: longitud mínima 8.
  2. Authentication → Policies → Password: activar "Leaked password protection".
  3. Authentication → Rate Limits: signups a 30 cada 5 minutos por IP.
- Dejar explícito en esa misma nota que `sign_in_sign_ups = 1000` en `config.toml` se queda así en local a propósito — es el valor que necesita la suite en paralelo, no el valor de producción.
- Añadir `headers()` a `next.config.ts` con `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` y `Referrer-Policy: strict-origin-when-cross-origin`, aplicados a todas las rutas (`source: "/(.*)"`, incluye `/api/*`).
- Paso de cierre estándar: bump `Fix` de versión, sin post de changelog.

**Fuera de alcance (para otra spec, si llega):**

- `Content-Security-Policy`. `SECURITY.md` (hallazgo 5) la recomienda, pero no está en el checklist del usuario y calibrarla contra Turnstile, Supabase, Google Fonts y MDX es trabajo aparte con más riesgo de romper algo.
- `password_requirements` (complejidad de caracteres en `config.toml`). El checklist solo pide longitud mínima.
- Los hallazgos de prioridad MEDIA de `SECURITY.md` no incluidos en este checklist: rate limit persistente del formulario de contacto, límite de frecuencia en `increment_game_plays`.
- Tocar las políticas de `select` público existentes en `games`/`scores`. El checklist pide que RLS esté encendido, no reabrir qué filas son visibles.
- `Strict-Transport-Security` explícito. Vercel ya lo aplica por defecto en producción; no se declara en el repo.

## Modelo de datos

Esta spec no introduce estructuras de datos nuevas.

## Plan de implementación

1. `supabase/config.toml`: subir `minimum_password_length` de `6` a `8`. Comprobar que `npm test` sigue en verde — `SEED_PASSWORD` (`tests/screens.spec.ts`) tiene 18 caracteres, no lo afecta.
2. `next.config.ts`: añadir `headers()` devolviendo `X-Content-Type-Options`, `X-Frame-Options` y `Referrer-Policy` para `source: "/(.*)"`.
3. `README.md`: añadir, junto a las notas existentes sobre `enable_anonymous_sign_ins` y `[auth.captcha]`, los tres pasos manuales del proyecto remoto (longitud de contraseña, leaked password protection, límite de signups a 30/5min) y la aclaración de por qué `sign_in_sign_ups` se queda alto en local.
4. `README.md`: nota breve dejando constancia de que RLS en `games` y `scores` ya estaba habilitado antes de esta spec, sin acción pendiente.
5. Cierre: bump `Fix` en `package.json`, `components/footer.tsx` y el `logo-version` de `components/nav.tsx`. Sin post nuevo en `/blog`.

## Criterios de aceptación

- [x] `supabase/config.toml` tiene `minimum_password_length = 8`.
- [x] `npm test` sigue pasando tras el cambio de longitud mínima.
- [x] `next.config.ts` aplica `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` y `Referrer-Policy: strict-origin-when-cross-origin` a todas las rutas — verificable con `curl -I` contra `next start`.
- [x] `README.md` documenta los tres pasos manuales en el proyecto remoto (longitud de contraseña, leaked password protection, límite de signups) y por qué `sign_in_sign_ups` se queda en 1000 en local.
- [x] `README.md` deja constancia de que RLS en `games` y `scores` ya estaba satisfecho antes de esta spec.
- [x] La versión sube como `Fix` en `package.json`, `components/footer.tsx` y `components/nav.tsx` (`logo-version`), sin post nuevo en `/blog`.

## Decisiones

- **Sí:** subir solo `minimum_password_length`, sin `password_requirements`. El checklist pide longitud, no complejidad — añadirla sería fricción de registro no pedida.
- **No:** `Content-Security-Policy` ahora. Más riesgo de romper Turnstile/Supabase/fonts sin un trabajo de calibración aparte; spec futura si se decide.
- **Sí:** leaked password protection documentado como paso manual de panel, no como clave de `config.toml`. No existe ese ajuste en el stack autoalojado — mismo patrón que los demás toggles remotos ya documentados en este repo.
- **Sí:** headers aplicados a todas las rutas, incluyendo `/api/*`, como pidió el usuario en su ejemplo.
- **No:** tocar `sign_in_sign_ups` en `config.toml` local. Ya está deliberadamente alto para no romper la suite en paralelo; el valor de producción (30/5min) se documenta para el panel remoto, no se fuerza en local.
- **Sí:** el punto de RLS se trata como "verificar y documentar", nunca como "modificar". Ya cumplía desde SPEC 16/29.

## Riesgos

| Riesgo                                                                | Mitigación                                                                                                                      |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `X-Frame-Options: DENY` rompe algo que hoy se embeba en un `<iframe>` | No hay ningún caso de uso de ese tipo en el repo actual; si aparece uno futuro, cambiar a `SAMEORIGIN` en esa misma línea.      |
| Los tres pasos manuales del panel remoto se olvidan al desplegar      | Quedan documentados en `README.md` en el mismo formato y junto a los demás toggles manuales ya existentes (anonymous, captcha). |

## Qué **no** entra en esta spec

- `Content-Security-Policy` — spec futura si se decide calibrarla.
- Complejidad de contraseña más allá de la longitud mínima.
- Rate limit persistente del formulario de contacto ni límite de frecuencia en `increment_game_plays` — hallazgos MEDIA de `SECURITY.md` fuera de este checklist.
- Revisión de las políticas de `select` público en `games`/`scores`.
- `Strict-Transport-Security` explícito en el repo.

Cada uno de estos, si llega, va en su propia spec.
