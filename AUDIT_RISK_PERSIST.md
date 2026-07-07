# Auditoría read-only — Persistencia de ajustes Risk MGMT (valor + estado activado)

Fecha: 2026-07-06 · Alcance: `pages/index.js`, `pages/api/risk.js`, `sql/risk_profiles.sql`, `lib/settings.js`. Solo lectura.

Objetivo: que los tres ajustes de Risk MGMT — **Máx. riesgo / op.** (%), **Máx. capital / op.** (%), **Máx. slots simult.** (nº) — persistan entre sesiones **tanto el valor como el estado activado/verde** (6 piezas).

**Conclusión rápida:** el código (cliente + API) **ya soporta** persistir las 6 piezas en Supabase (tabla `risk_profiles`, no en `v50_settings`). PERO la **tabla `risk_profiles` NO tiene las columnas `active_riesgo_op` / `active_capital_op` / `active_slots`** (`sql/risk_profiles.sql:10-20` solo define los valores, no los flags). Por eso el **estado activado no persiste**: el PATCH que las envía falla en Supabase (columna inexistente) y el `catch{}` lo traga, y al recargar el GET devuelve filas sin esos campos → se reaplican los defaults (`??true/false/false`). Además, una vez que en la sesión se ha togglado una card (que mete `active_*` en el objeto en memoria), **los guardados de VALOR también pueden fallar** porque `riskSaveField` reenvía el perfil entero (incluidos los `active_*`) en el body. El fix es de **base de datos** (añadir 3 columnas), sin tocar el código.

---

## 1. Los tres controles (6 piezas: valor + activo)

Render de las 3 cards: `pages/index.js:6909-6980`. Todos los datos salen del **perfil de riesgo activo** `riskActiveProfile` (`:1408`).

| Control | VALOR (estado/campo) | ACTIVO (estado/campo) |
|---|---|---|
| Máx. riesgo / op. | `_rpt = riskActiveProfile?.risk_per_trade_value` (`:6721`), editable → `riskSaveField('risk_per_trade_value',…)` (`:6920`) | `_activeRO = riskActiveProfile?.active_riesgo_op ?? true` (`:6735`), toggle → `riskToggleCard('active_riesgo_op')` (`:6911`) |
| Máx. capital / op. | `_maxR = riskActiveProfile?.max_total_risk` (`:6726`), editable → `riskSaveField('max_total_risk',…)` (`:6944`) | `_activeCO = riskActiveProfile?.active_capital_op ?? false` (`:6736`), toggle → `riskToggleCard('active_capital_op')` (`:6935`) |
| Máx. slots simult. | `_maxS = riskActiveProfile?.max_simultaneous_positions` (`:6727`), editable → `riskSaveField('max_simultaneous_positions',…)` (`:6968`) | `_activeSL = riskActiveProfile?.active_slots ?? false` (`:6737`), toggle → `riskToggleCard('active_slots')` (`:6959`) |

El "verde" se pinta a partir de `_activeRO/_activeCO/_activeSL` (borde/fondo/punto: `:6913-6915`, `:6937-6939`, `:6961-6963`). No hay estados de React sueltos por card: **todo cuelga del objeto `riskActiveProfile`** (derivado de `riskProfiles`, `:1097`/`:1408`).

Cita: `pages/index.js:6721/6726/6727/6735/6736/6737`, `:6909-6980`, `:1408`.

---

## 2. Persistencia actual de esas 6 piezas

**Sí hay un camino de persistencia — a Supabase vía `/api/risk`, por perfil:**
- **Toggle activo** → `riskToggleCard(field)` (`:1431-1438`): actualiza estado local **y** `POST /api/risk?action=update&id=…` con `{[field]:newVal}`.
- **Editar valor** → `riskSaveField(field,val)` (`:1472-1479`): `POST /api/risk?action=update&id=…` con `body={...riskActiveProfile,[field]:numVal}` (envía el perfil entero) y actualiza estado local.
- **Carga al montar** → `useEffect` (`:1401-1406`): `GET /api/risk` → `setRiskProfiles(d)`. Se dispara con `session.user.id`.

Por tanto, en el código, **las 6 piezas están cableadas para persistir** en la fila del perfil. El problema no es de cableado sino de **esquema** (punto 3/4): los 3 valores son columnas reales y persisten; los 3 flags `active_*` **no son columnas** y no se guardan.

Cita: `pages/index.js:1401-1406` (load), `:1431-1438` (toggle), `:1472-1479` (value).

---

## 3. Mecanismo de settings existente (dos sistemas distintos)

Hay **DOS** sistemas de persistencia en la app, y risk usa el segundo:

**(a) `v50_settings` (localStorage) + `user_settings` (Supabase)** — para ajustes generales de UI/app:
- `lib/settings.js`: `loadSettings()/saveSettings()` (localStorage, `SETTINGS_KEY='v50_settings'`, `:3/11-16`), `saveSettingsRemote(s)` (`:20-29`: `POST /rest/v1/user_settings` con `Prefer: resolution=merge-duplicates` = upsert por `user_id` vía RLS), `loadSettingsRemote()` (`:30-39`).
- Es **un objeto JSON entero serializado** (nested: `ui`, `watchlist`, `alarmas`, `defaultStrategyId`, `defaultCapital`…), leído con `JSON.parse(localStorage.getItem('v50_settings'))?.x.y` y escrito con read-modify-write (p.ej. `pages/index.js:787`, `:2402-2404`, `:2507`).
- **Sincronización LS↔Supabase**: al cargar, **Supabase tiene prioridad** sobre localStorage (`pages/index.js:2076-2079`); al guardar remoto, `saveSettingsRemote` escribe **ambos** (local primero, luego upsert remoto, `lib/settings.js:21-27`). El fetch remoto vive en `pages/index.js:2067` y `:3424-3427`.

**(b) `risk_profiles` (Supabase) vía `/api/risk`** — para los perfiles de riesgo (lo que nos ocupa):
- Tabla propia `risk_profiles` con RLS `auth.uid()=user_id` (`sql/risk_profiles.sql:49-59`). CRUD en `pages/api/risk.js` (GET list `:31-34`, create `:37-54`, update `:56-75`, delete `:78-82`).
- **El endpoint SÍ contempla los 6 campos** (valores + `active_*`) tanto en create (`:38/48-50`) como en update (`:59/66-68`). O sea, la API está lista.
- **Pero el esquema NO define los `active_*`**: `sql/risk_profiles.sql:10-20` crea solo `name, risk_per_trade_type, risk_per_trade_value, max_total_risk, max_simultaneous_positions, created_at, updated_at`. **Faltan `active_riesgo_op`, `active_capital_op`, `active_slots`.**
- Selección de perfil activo + modo + nº slots persisten aparte en **localStorage** (`v50_risk_active_id` `:1098/1423`, `v50_risk_mode` `:1106`, `v50_risk_nslots` `:1107/6968`).

Cita: `lib/settings.js:3/11-16/20-39`; `pages/index.js:787/2067/2076-2079/2402-2404/3424-3427`; `pages/api/risk.js:38/48-50/59/66-68`; `sql/risk_profiles.sql:10-20`.

---

## 4. Dónde enganchar (patrón de menor fricción)

**No hay que añadir nada a `v50_settings`/`user_settings`.** El patrón ya existente para risk es la tabla `risk_profiles`, y el cliente + la API ya la usan para los 6 campos. El único hueco es el **esquema de la BD**:

- **Fix mínimo (solo BD, cero cambios de código):** añadir las 3 columnas a `risk_profiles`:
  ```sql
  ALTER TABLE risk_profiles
    ADD COLUMN IF NOT EXISTS active_riesgo_op  boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS active_capital_op boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS active_slots      boolean NOT NULL DEFAULT false;
  ```
  Ejecutar en el SQL Editor de Supabase (y conviene reflejarlo en `sql/risk_profiles.sql` para el repo). Con eso: el PATCH de `riskToggleCard` deja de fallar → el estado activado persiste; el GET devuelve los flags → al recargar se respetan (ya no caen a los defaults `??`). Los 3 **valores** ya persisten (son columnas), salvo el efecto colateral del punto siguiente.

- **Efecto colateral que este fix también resuelve:** hoy, tras togglear una card, `riskActiveProfile` lleva `active_*` en memoria y `riskSaveField` reenvía el perfil entero (`body={...riskActiveProfile,…}`, `:1475`); el endpoint mete esos `active_*` en el `updates` (`:66-68`) → PATCH a columnas inexistentes → **falla el guardado del valor también**. Al crear las columnas, ese PATCH pasa a ser válido y el valor se guarda aunque el body incluya los flags. (Alternativa de código, no imprescindible si se hace el ALTER: que `riskSaveField` envíe solo `{[field]:numVal}` en vez del perfil entero.)

Cita: `sql/risk_profiles.sql:10-20` (donde faltan columnas); `pages/api/risk.js:66-68` (update ya listo); `pages/index.js:1475` (body entero en value save).

---

## 5. localStorage vs Supabase — coherencia con el resto

- **Los valores de risk ya van a Supabase** (`risk_profiles`, por usuario, **cross-device** vía RLS `auth.uid()=user_id`). Es el mismo criterio "por usuario" que los ajustes generales cuando usan `user_settings` (también Supabase por usuario). Lo único que hoy queda en **localStorage** (por dispositivo) para risk es: qué perfil está activo (`v50_risk_active_id`), el modo (`v50_risk_mode`) y el nº de slots suelto (`v50_risk_nslots`).
- Para las 6 piezas que pides (valores + activos), **lo coherente con el resto es Supabase** (`risk_profiles`), que es donde ya están cableadas: así persisten por usuario y entre dispositivos, igual que los perfiles y sus valores actuales. Añadir las 3 columnas mantiene todo en el mismo sitio, sin duplicar en `v50_settings`.
- (Si en algún momento se quisiera "por dispositivo", habría que moverlo a `v50_settings`/localStorage, pero eso rompería la coherencia con cómo ya se guarda el resto del perfil de riesgo. Tú decides; la ruta de menor fricción y más coherente es Supabase / `risk_profiles`.)

Cita: `sql/risk_profiles.sql:49-59` (RLS por usuario); `pages/index.js:1098/1106/1107` (lo que hoy va a localStorage).

---

## Resumen

| # | Hallazgo | Cita |
|---|---|---|
| 1 | Las 3 cards y sus 6 piezas cuelgan de `riskActiveProfile`: valores `risk_per_trade_value/max_total_risk/max_simultaneous_positions`, flags `active_riesgo_op/active_capital_op/active_slots` | `index.js:6721-6737`, `:6909-6980`, `:1408` |
| 2 | Ya cableadas para persistir: toggle (`riskToggleCard`) y valor (`riskSaveField`) hacen PATCH a `/api/risk`; carga con GET al montar | `index.js:1401-1406/1431-1438/1472-1479` |
| 3 | Dos sistemas: (a) `v50_settings`+`user_settings` (objeto JSON, LS+Supabase, prioridad Supabase) para ajustes generales; (b) `risk_profiles` (Supabase, RLS) para risk. El endpoint ya soporta los 6 campos | `lib/settings.js:11-39`, `api/risk.js:38/48-50/66-68`, `index.js:2067/2076-2079` |
| 4 | **Causa raíz:** `risk_profiles` NO tiene columnas `active_*` → toggles no persisten (PATCH falla, `catch{}` lo traga; GET sin flags → defaults). Fix = `ALTER TABLE … ADD COLUMN` (solo BD). Además desbloquea el value-save cuando el body arrastra `active_*` | `sql/risk_profiles.sql:10-20`, `api/risk.js:66-68`, `index.js:1475` |
| 5 | Los valores de risk ya van a Supabase por usuario (cross-device); lo coherente es persistir también los flags ahí (añadir columnas), no en `v50_settings` | `sql/risk_profiles.sql:49-59`, `index.js:1098/1106/1107` |
