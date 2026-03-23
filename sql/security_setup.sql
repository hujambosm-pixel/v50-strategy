-- =============================================================
-- SECURITY SETUP — Trading Simulator (single-user app)
-- =============================================================
-- ORDEN DE EJECUCIÓN:
--   1. Ejecutar este script COMPLETO en el SQL Editor de Supabase
--      ANTES de activar RLS (el UPDATE de filas existentes requiere
--      acceso sin RLS).
--   2. Crear el usuario en Supabase Auth:
--      Dashboard → Authentication → Users → Add user
--      (o usar la pantalla de login de la app la primera vez).
--   3. Copiar el UUID del usuario creado y reemplazar 'TU-UUID-AQUI'
--      en el bloque UPDATE de más abajo, luego ejecutar ese bloque.
-- =============================================================


-- ─────────────────────────────────────────────────────────────
-- PASO 1: Añadir columna user_id a todas las tablas de datos
-- (nullable para no romper filas existentes)
-- ─────────────────────────────────────────────────────────────

ALTER TABLE trades_log             ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE capital_contributions  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE watchlist              ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE strategies             ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE ranking_results        ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE alarms                 ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE conditions             ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE user_settings          ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

-- fx_rates es caché compartida — NO añadir user_id


-- ─────────────────────────────────────────────────────────────
-- PASO 2: Índices para consultas filtradas por usuario
-- ─────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_trades_log_user            ON trades_log(user_id);
CREATE INDEX IF NOT EXISTS idx_capital_contributions_user ON capital_contributions(user_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_user             ON watchlist(user_id);
CREATE INDEX IF NOT EXISTS idx_strategies_user            ON strategies(user_id);
CREATE INDEX IF NOT EXISTS idx_ranking_results_user       ON ranking_results(user_id);
CREATE INDEX IF NOT EXISTS idx_alarms_user                ON alarms(user_id);
CREATE INDEX IF NOT EXISTS idx_conditions_user            ON conditions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_settings_user         ON user_settings(user_id);


-- ─────────────────────────────────────────────────────────────
-- PASO 3: Poblar user_id en filas existentes
-- ⚠ IMPORTANTE: Reemplaza 'TU-UUID-AQUI' con el UUID real del
--   usuario (Dashboard → Authentication → Users → copiar UUID)
-- ─────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_user_id uuid := 'TU-UUID-AQUI';  -- ← REEMPLAZAR
BEGIN
  UPDATE trades_log            SET user_id = v_user_id WHERE user_id IS NULL;
  UPDATE capital_contributions  SET user_id = v_user_id WHERE user_id IS NULL;
  UPDATE watchlist              SET user_id = v_user_id WHERE user_id IS NULL;
  UPDATE strategies             SET user_id = v_user_id WHERE user_id IS NULL;
  UPDATE ranking_results        SET user_id = v_user_id WHERE user_id IS NULL;
  UPDATE alarms                 SET user_id = v_user_id WHERE user_id IS NULL;
  UPDATE conditions             SET user_id = v_user_id WHERE user_id IS NULL;
  UPDATE user_settings          SET user_id = v_user_id WHERE user_id IS NULL;
END $$;


-- ─────────────────────────────────────────────────────────────
-- PASO 4: DEFAULT auth.uid() en nuevas filas
-- ─────────────────────────────────────────────────────────────

ALTER TABLE trades_log            ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE capital_contributions  ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE watchlist              ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE strategies             ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE ranking_results        ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE alarms                 ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE conditions             ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE user_settings          ALTER COLUMN user_id SET DEFAULT auth.uid();


-- ─────────────────────────────────────────────────────────────
-- PASO 5: Activar Row Level Security
-- ─────────────────────────────────────────────────────────────

ALTER TABLE trades_log            ENABLE ROW LEVEL SECURITY;
ALTER TABLE capital_contributions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist              ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategies             ENABLE ROW LEVEL SECURITY;
ALTER TABLE ranking_results        ENABLE ROW LEVEL SECURITY;
ALTER TABLE alarms                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE conditions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings          ENABLE ROW LEVEL SECURITY;

-- fx_rates: sin RLS (caché pública de tasas de cambio)


-- ─────────────────────────────────────────────────────────────
-- PASO 6: Políticas RLS — solo el propietario puede ver/editar
-- ─────────────────────────────────────────────────────────────

-- trades_log
DROP POLICY IF EXISTS "owner_trades_log"           ON trades_log;
CREATE POLICY "owner_trades_log"
  ON trades_log FOR ALL TO authenticated
  USING       (auth.uid() = user_id)
  WITH CHECK  (auth.uid() = user_id);

-- capital_contributions
DROP POLICY IF EXISTS "owner_capital_contributions" ON capital_contributions;
CREATE POLICY "owner_capital_contributions"
  ON capital_contributions FOR ALL TO authenticated
  USING       (auth.uid() = user_id)
  WITH CHECK  (auth.uid() = user_id);

-- watchlist
DROP POLICY IF EXISTS "owner_watchlist"            ON watchlist;
CREATE POLICY "owner_watchlist"
  ON watchlist FOR ALL TO authenticated
  USING       (auth.uid() = user_id)
  WITH CHECK  (auth.uid() = user_id);

-- strategies
DROP POLICY IF EXISTS "owner_strategies"           ON strategies;
CREATE POLICY "owner_strategies"
  ON strategies FOR ALL TO authenticated
  USING       (auth.uid() = user_id)
  WITH CHECK  (auth.uid() = user_id);

-- ranking_results
DROP POLICY IF EXISTS "owner_ranking_results"      ON ranking_results;
CREATE POLICY "owner_ranking_results"
  ON ranking_results FOR ALL TO authenticated
  USING       (auth.uid() = user_id)
  WITH CHECK  (auth.uid() = user_id);

-- alarms
DROP POLICY IF EXISTS "owner_alarms"               ON alarms;
CREATE POLICY "owner_alarms"
  ON alarms FOR ALL TO authenticated
  USING       (auth.uid() = user_id)
  WITH CHECK  (auth.uid() = user_id);

-- conditions
DROP POLICY IF EXISTS "owner_conditions"           ON conditions;
CREATE POLICY "owner_conditions"
  ON conditions FOR ALL TO authenticated
  USING       (auth.uid() = user_id)
  WITH CHECK  (auth.uid() = user_id);

-- user_settings
DROP POLICY IF EXISTS "owner_user_settings"        ON user_settings;
CREATE POLICY "owner_user_settings"
  ON user_settings FOR ALL TO authenticated
  USING       (auth.uid() = user_id)
  WITH CHECK  (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────
-- PASO 7 (OPCIONAL): Eliminar columna color de primer nivel
-- si existe en la tabla conditions (el color se guarda en params)
-- ─────────────────────────────────────────────────────────────

ALTER TABLE conditions DROP COLUMN IF EXISTS color;


-- =============================================================
-- FIN DEL SCRIPT
-- Después de ejecutarlo:
--   1. Ir a Dashboard → Authentication → Users → crear usuario
--   2. Copiar el UUID, reemplazar 'TU-UUID-AQUI' y re-ejecutar
--      solo el bloque DO $$ ... END $$ del PASO 3
--   3. Configurar en Vercel las env vars:
--        NEXT_PUBLIC_SUPABASE_URL   = https://xxx.supabase.co
--        NEXT_PUBLIC_SUPABASE_ANON_KEY = sb_publishable_...
--        SUPABASE_URL               = https://xxx.supabase.co
--        SUPABASE_ANON_KEY          = sb_publishable_...
-- =============================================================
