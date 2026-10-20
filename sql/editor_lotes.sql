-- sql/editor_lotes.sql — LOTES del editor visual (docs/editor-visual.md, E10; decisión 4: tabla nueva e inmutable).
--
-- QUÉ. Una fila por lote declarado desde la pestaña Editor ANTES de ver sus resultados: su nombre, la versión de la app,
-- el lote entero (formato 1 de lib/editor/lotes.js: lo común —activos, periodo, temporalidad, reparto, simulaciones— y las
-- variantes, cada una con su definición y sus valores), su huella (sha256 del JSON canónico) y las huellas de sus
-- variantes. Los lotes antiguos (LOTE_1–3, CARTERA_1–3) siguen en el código (lib/lotesLab.js), sin cambios.
-- Las EJECUCIONES de un lote van al registro de siempre (lab_pruebas), exploratorias, con config.prueba = 'editorLote' y
-- la huella del lote dentro: así cuentan en el historial de pruebas como las demás.
--
-- QUIÉN. Como lab_pruebas: user_id = auth.uid() y RLS «dueño». De SOLO AÑADIR: el usuario puede leer e insertar sus
-- lotes, no cambiarlos ni borrarlos (un lote congelado no se retoca después de ver resultados). La huella es única por
-- usuario: declarar dos veces el mismo lote no crea otro.
--
-- REVERSIÓN: DROP TABLE public.editor_lotes; (no la usa nada más).
--
-- BORRAR UN LOTE (p. ej. uno de ensayo): el usuario no puede; se hace por la Management API, que conecta como postgres,
-- con la huella como guardia para no borrar otra fila por un id equivocado:
--   DELETE FROM public.editor_lotes WHERE id = <id> AND hash_lote = '<hash_lote de esa fila>' RETURNING id;

CREATE TABLE public.editor_lotes (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  creado       timestamptz NOT NULL DEFAULT now(),
  version_app  text,
  nombre       text NOT NULL,
  lote         jsonb NOT NULL,
  hash_lote    text NOT NULL,
  huellas      jsonb NOT NULL,
  CONSTRAINT editor_lotes_hash CHECK (hash_lote ~ '^[0-9a-f]{64}$'),
  CONSTRAINT editor_lotes_nombre CHECK (length(btrim(nombre)) BETWEEN 1 AND 120),
  CONSTRAINT editor_lotes_formato CHECK ((lote->>'formato') = '1'),
  CONSTRAINT editor_lotes_tamano CHECK (octet_length(lote::text) <= 204800),
  CONSTRAINT editor_lotes_unico UNIQUE (user_id, hash_lote)
);
CREATE INDEX editor_lotes_usuario_creado ON public.editor_lotes (user_id, creado DESC);

ALTER TABLE public.editor_lotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY editor_lotes_leer ON public.editor_lotes FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY editor_lotes_insertar ON public.editor_lotes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
REVOKE ALL ON public.editor_lotes FROM anon;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.editor_lotes FROM authenticated;
GRANT SELECT, INSERT ON public.editor_lotes TO authenticated;
