-- =============================================================
-- RISK PROFILES — Trading Simulator
-- Ejecutar en Supabase SQL Editor
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- PASO 1: Crear tabla risk_profiles
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS risk_profiles (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     uuid REFERENCES auth.users(id) DEFAULT auth.uid(),
  name                        text NOT NULL,
  risk_per_trade_type         text NOT NULL DEFAULT '%'      CHECK (risk_per_trade_type IN ('%', '€')),
  risk_per_trade_value        numeric NOT NULL DEFAULT 1,
  max_total_risk              numeric NOT NULL DEFAULT 5,    -- % del equity
  max_simultaneous_positions  integer NOT NULL DEFAULT 5,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- PASO 2: Índice
-- ─────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_risk_profiles_user ON risk_profiles(user_id);

-- ─────────────────────────────────────────────────────────────
-- PASO 3: Trigger para actualizar updated_at automáticamente
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS risk_profiles_updated_at ON risk_profiles;
CREATE TRIGGER risk_profiles_updated_at
  BEFORE UPDATE ON risk_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────────────────────
-- PASO 4: Activar Row Level Security
-- ─────────────────────────────────────────────────────────────

ALTER TABLE risk_profiles ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- PASO 5: Políticas RLS
-- ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "owner_risk_profiles" ON risk_profiles;
CREATE POLICY "owner_risk_profiles"
  ON risk_profiles FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
