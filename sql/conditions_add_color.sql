-- ──────────────────────────────────────────────────────────────
-- Migración: añadir columna color a la tabla conditions
-- Ejecutar en Supabase → SQL Editor
-- ──────────────────────────────────────────────────────────────

-- 1) Añadir la columna (nullable, text — almacena '#rrggbb')
alter table conditions
  add column if not exists color text;

-- 2) Migrar colores ya guardados dentro de params->'color' a la nueva columna
--    (sólo si la columna aún no tiene valor para esa fila)
update conditions
set    color = params->>'color'
where  params->>'color' is not null
  and  (color is null or color = '');

-- 3) Limpiar el campo color dentro del JSON para evitar duplicidad
--    (opcional pero recomendado — el código ya no lo escribe en params)
update conditions
set    params = params - 'color'
where  params ? 'color';
