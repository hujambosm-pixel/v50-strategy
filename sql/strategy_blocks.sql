-- strategy_blocks: biblioteca de bloques reutilizables por sección
-- Sin RLS, sin user_id — app de usuario único
-- Ejecutar manualmente en el dashboard de Supabase → SQL Editor

CREATE TABLE IF NOT EXISTS strategy_blocks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role        text NOT NULL,
              -- 'filter' | 'setup' | 'trigger' | 'abort' | 'exit' | 'stop'
  name        text NOT NULL,
  definition  jsonb NOT NULL,
  created_at  timestamptz DEFAULT now()
);

-- Bloques por defecto (seed)
INSERT INTO strategy_blocks (role, name, definition) VALUES

-- FILTER
('filter', 'SP500 tendencia alcista',
  '{"type":"precio_ema","sp500EmaR":50,"sp500EmaL":200}'),
('filter', 'SP500 EMA alcista',
  '{"type":"ema_ema","sp500EmaR":50,"sp500EmaL":200}'),

-- SETUP
('setup', 'Cruce EMAs',
  '{"type":"ema_cross_up","ma_fast":10,"ma_slow":20}'),
('setup', 'RSI sobrevendido',
  '{"type":"rsi_cross_up","rsi_period":14,"rsi_level":30}'),
('setup', 'Precio sobre EMA',
  '{"type":"price_above_ma","ma_period":50}'),
('setup', 'MACD cruce alcista',
  '{"type":"macd_cross_up","macd_fast":12,"macd_slow":26,"macd_signal":9}'),

-- EXIT
('exit', 'Cruce bajista EMA',
  '{"type":"close_below_ma","ma_period":10}'),
('exit', 'RSI sobrecomprado',
  '{"type":"rsi_above","rsi_period":14,"rsi_level":70}'),
('exit', 'MACD cruza abajo',
  '{"type":"macd_cross_down","macd_fast":12,"macd_slow":26,"macd_signal":9}'),

-- STOP
('stop', 'Stop técnico',
  '{"type":"tecnico"}'),
('stop', 'ATR dinámico',
  '{"type":"atr_based","atr_period":14,"atr_mult":2}'),
('stop', 'Fijo %',
  '{"type":"fixed_pct","pct":5}'),
('stop', 'Trailing ATR',
  '{"type":"trailing_atr","atr_period":14,"atr_mult":2}');
