-- sql/tesis_adjuntos.sql — «Imágenes y adjuntos» de la pantalla «Tesis» (docs/tesis.md): los archivos de una tesis, en un bucket privado.
--
-- QUÉ. Una fila por archivo: de qué tesis es, su clase ('imagen': dentro del texto; 'adjunto': en la zona Adjuntos), su ruta en el bucket,
-- su nombre ORIGINAL (con tildes, hasta 200; en la ruta nunca), su tipo (MIME) y sus bytes (hasta 50 MB). Se crean y se borran, nunca se
-- cambian: un archivo cambiado es un archivo nuevo. Al borrar la tesis, sus filas se van con ella (ON DELETE CASCADE); los ARCHIVOS los
-- borra antes la pantalla (lib/tesisArchivos.js, borrarTodoDeTesis), porque la base no llega al bucket.
-- Los archivos viven en el bucket PRIVADO «tesis-archivos»: <user_id>/<tesis_id>/<clase>/<uuid>.<extensión>. Se leen solo con URL firmadas.
-- Tipos admitidos: png, jpeg, gif, webp, pdf, doc, docx, xls, xlsx, ppt, pptx, csv y txt. NADA de svg ni html (podrían ejecutar código).
--
-- QUIÉN. Como tesis_inversion: user_id = auth.uid() y RLS «dueño»: cada usuario lee, crea y borra SOLO lo suyo; sin UPDATE. Al crear, la tesis
-- tiene que ser suya y la ruta, de su carpeta y de esa tesis y clase. Permiso por columnas: id, user_id y created_at los pone la base.
-- En el bucket, para authenticated: SELECT, INSERT y DELETE solo en la carpeta propia (el primer trozo de la ruta = auth.uid()); sin UPDATE. anon, nada.
--
-- REVERSIÓN (primero vaciar el bucket con la API de Storage, la base no deja borrar archivos a mano):
--   DROP POLICY tesis_archivos_leer ON storage.objects; DROP POLICY tesis_archivos_subir ON storage.objects; DROP POLICY tesis_archivos_borrar ON storage.objects;
--   DELETE FROM storage.buckets WHERE id = 'tesis-archivos';
--   DROP TABLE public.tesis_adjuntos;

CREATE TABLE public.tesis_adjuntos (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  tesis_id   bigint NOT NULL REFERENCES public.tesis_inversion(id) ON DELETE CASCADE,
  clase      text NOT NULL,
  ruta       text NOT NULL UNIQUE,
  nombre     text NOT NULL,
  tipo       text,
  bytes      bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tesis_adjuntos_clase CHECK (clase IN ('imagen', 'adjunto')),
  CONSTRAINT tesis_adjuntos_nombre CHECK (length(nombre) BETWEEN 1 AND 200),
  CONSTRAINT tesis_adjuntos_bytes CHECK (bytes > 0 AND bytes <= 52428800)
);
CREATE INDEX tesis_adjuntos_usuario ON public.tesis_adjuntos (user_id, tesis_id);

ALTER TABLE public.tesis_adjuntos ENABLE ROW LEVEL SECURITY;
CREATE POLICY tesis_adjuntos_leer ON public.tesis_adjuntos FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY tesis_adjuntos_insertar ON public.tesis_adjuntos FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (SELECT 1 FROM public.tesis_inversion t WHERE t.id = tesis_id AND t.user_id = auth.uid())
  AND starts_with(ruta, auth.uid()::text || '/' || tesis_id::text || '/' || clase || '/')
);
CREATE POLICY tesis_adjuntos_borrar ON public.tesis_adjuntos FOR DELETE TO authenticated USING (auth.uid() = user_id);
REVOKE ALL ON public.tesis_adjuntos FROM anon;
REVOKE ALL ON public.tesis_adjuntos FROM authenticated;
GRANT SELECT, DELETE ON public.tesis_adjuntos TO authenticated;
GRANT INSERT (tesis_id, clase, ruta, nombre, tipo, bytes) ON public.tesis_adjuntos TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('tesis-archivos', 'tesis-archivos', false, 52428800, ARRAY[
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/csv', 'text/plain']);

CREATE POLICY tesis_archivos_leer ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'tesis-archivos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY tesis_archivos_subir ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'tesis-archivos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY tesis_archivos_borrar ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'tesis-archivos' AND (storage.foldername(name))[1] = auth.uid()::text);
