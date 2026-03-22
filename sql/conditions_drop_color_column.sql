-- Eliminar columna color de primer nivel (el color se guarda en params->>'color')
ALTER TABLE conditions DROP COLUMN IF EXISTS color;
