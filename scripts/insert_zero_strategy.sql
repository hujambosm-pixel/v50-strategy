-- Insert "0 No Strategy" into the strategies table.
-- This strategy returns no trades by itself; it is designed to be used
-- exclusively with market filters (VIX, Índice EMA, Sector EMA).
-- When run with active filters, the backtester generates trades
-- automatically from filter state transitions (false→true = entry at next open,
-- true→false = exit at same day's close).
--
-- Run this in your Supabase SQL editor:
-- https://app.supabase.com → SQL Editor

INSERT INTO strategies (
  name,
  description,
  code_js,
  params,
  visuals,
  active,
  years,
  capital_ini,
  color
)
VALUES (
  '0 No Strategy',
  'Sin señales propias. Entra y sale según los filtros de mercado activos. Combinar con VIX, Índice EMA o Sector EMA para generar períodos de exposición automáticos.',
  'function run(bars, params) { return { trades: [], indicators: {}, openPosition: null } }',
  '{}',
  NULL,
  true,
  5,
  10000,
  '#7a9bc0'
);
