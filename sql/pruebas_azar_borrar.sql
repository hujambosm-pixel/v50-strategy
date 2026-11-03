-- sql/pruebas_azar_borrar.sql — se pueden borrar las pruebas contra el azar (docs/builder.md, §60; decisión de Sergi, 03/11/2026).
--
-- QUÉ. Hasta ahora pruebas_azar era de solo añadir (sql/pruebas_azar.sql). Sergi quiere poder borrar todo: una prueba y, al borrar una
-- estrategia, sus pruebas. Una prueba borrada desaparece del todo; la app avisa de que quedarse solo con las que pasan puede ser
-- quedarse con una que pasó por suerte. Se sigue sin poder CAMBIAR una prueba: sin UPDATE.
--
-- QUIÉN. Solo lo propio: política de DELETE para authenticated con auth.uid() = user_id. anon, nada.
-- pruebas_azar_resultados no recibe DELETE: su fila se va con la prueba (ON DELETE CASCADE), en la misma operación. Las acciones de la
-- clave ajena no pasan por la RLS, y el usuario no puede borrar un resultado y dejar la prueba.
--
-- COMPROBACIÓN: node scripts/comprobaciones/pruebasAzarSeguridad.js (usuarios simulados, en una transacción que se deshace siempre).
--
-- REVERSIÓN:
--   REVOKE DELETE ON public.pruebas_azar FROM authenticated;
--   DROP POLICY pruebas_azar_borrar ON public.pruebas_azar;
--   ALTER TABLE public.pruebas_azar_resultados DROP CONSTRAINT pruebas_azar_resultados_prueba_id_fkey,
--     ADD CONSTRAINT pruebas_azar_resultados_prueba_id_fkey FOREIGN KEY (prueba_id) REFERENCES public.pruebas_azar(id);
-- (Las pruebas ya borradas no vuelven; lo que haya en backups/, sí.)

BEGIN;
ALTER TABLE public.pruebas_azar_resultados DROP CONSTRAINT pruebas_azar_resultados_prueba_id_fkey,
  ADD CONSTRAINT pruebas_azar_resultados_prueba_id_fkey FOREIGN KEY (prueba_id) REFERENCES public.pruebas_azar(id) ON DELETE CASCADE;
CREATE POLICY pruebas_azar_borrar ON public.pruebas_azar FOR DELETE TO authenticated USING (auth.uid() = user_id);
GRANT DELETE ON public.pruebas_azar TO authenticated;
COMMIT;
