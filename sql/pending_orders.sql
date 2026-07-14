-- =============================================================
-- PENDING ORDERS — Trading Simulator
-- Ejecutar en Supabase SQL Editor
-- (Calcado de risk_profiles.sql: user_id DEFAULT auth.uid() + RLS owner)
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- PASO 1: Crear tabla pending_orders
-- Una orden pendiente por (usuario, símbolo) → UNIQUE (user_id, symbol)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pending_orders (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES auth.users(id) DEFAULT auth.uid(),
  symbol       text NOT NULL,
  entry_price  numeric NOT NULL,
  stop_price   numeric NOT NULL,
  tp_price     numeric,               -- opcional
  shares       integer,               -- nº de acciones sugerido (sizing Risk MGMT)
  currency     text,
  profile_id   uuid,                  -- perfil de riesgo usado (opcional, sin FK)
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, symbol)
);

-- ─────────────────────────────────────────────────────────────
-- PASO 2: Índice
-- ─────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_pending_orders_user ON pending_orders(user_id);

-- ─────────────────────────────────────────────────────────────
-- PASO 3: Trigger para actualizar updated_at automáticamente
-- (reutiliza la función update_updated_at() creada en risk_profiles.sql;
--  se redefine aquí por si este script se ejecuta primero)
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pending_orders_updated_at ON pending_orders;
CREATE TRIGGER pending_orders_updated_at
  BEFORE UPDATE ON pending_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────────────────────
-- PASO 4: Activar Row Level Security
-- ─────────────────────────────────────────────────────────────

ALTER TABLE pending_orders ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- PASO 5: Políticas RLS — solo el propietario puede ver/editar
-- ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "owner_pending_orders" ON pending_orders;
CREATE POLICY "owner_pending_orders"
  ON pending_orders FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
