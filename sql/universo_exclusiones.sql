-- sql/universo_exclusiones.sql — exclusiones manuales del universo histórico (Fase 8a, paso 1b).
--
-- universo_miembros.excluido_motivo: si no es NULL, ese tramo NO cuenta como «con precios» aunque Yahoo dé velas, y
-- dice por qué. Lo lee scripts/coberturaUniverso.js (en vez de recalcularlo) y lo conserva scripts/universoNasdaq100.js
-- --guardar al reescribir el índice (por ticker, nombre y «desde»).
--   · los tramos que la comprobación de tickers reutilizados marcó en V9.954: el historial de Yahoo empieza después de
--     su salida o años después de su entrada (otra empresa con el ticker, o un valor deslistado al que Yahoo deja una
--     vela);
--   · Expedia 2008–2014: el salto ÷2,05 del 21-12-2011 es la escisión de TripAdvisor (con un contrasplit 1:2), que
--     Yahoo no ajusta; la serie es de Expedia, pero ese día rompe cualquier cálculo de rendimientos;
--   · VimpelCom (VIP) 2013–2015: la serie no es creíble (300–900 USD hasta 2022 y 2,8 en 2023; VimpelCom cotizaba a
--     unos 10 USD y hoy es VEON, con otro ticker).
-- REVERSIÓN: ALTER TABLE public.universo_miembros DROP COLUMN excluido_motivo;
ALTER TABLE public.universo_miembros ADD COLUMN excluido_motivo text;

UPDATE public.universo_miembros SET excluido_motivo = 'ticker reutilizado / serie incompleta: Yahoo empieza el 2026-07-17, después de su salida'
  WHERE indice = 'NDX' AND simbolo = 'BBBY' AND nombre = 'Bed Bath & Beyond' AND desde = '2008-01-01';
UPDATE public.universo_miembros SET excluido_motivo = 'ticker reutilizado / serie incompleta: Yahoo empieza el 2016-08-17, después de su salida'
  WHERE indice = 'NDX' AND simbolo = 'DELL' AND nombre = 'Dell' AND desde = '2008-01-01';
UPDATE public.universo_miembros SET excluido_motivo = 'ticker reutilizado / serie incompleta: Yahoo empieza el 2026-08-04, después de su salida'
  WHERE indice = 'NDX' AND simbolo = 'EA' AND nombre = 'Electronic Arts' AND desde = '2008-01-01';
UPDATE public.universo_miembros SET excluido_motivo = 'salto sin ajustar 21-12-2011 (escisión TripAdvisor)'
  WHERE indice = 'NDX' AND simbolo = 'EXPE' AND nombre = 'Expedia' AND desde = '2008-01-01';
UPDATE public.universo_miembros SET excluido_motivo = 'ticker reutilizado / serie incompleta: Yahoo empieza el 2021-10-05, después de su salida'
  WHERE indice = 'NDX' AND simbolo = 'JAVA' AND nombre = 'Sun Microsystems' AND desde = '2008-01-01';
UPDATE public.universo_miembros SET excluido_motivo = 'ticker reutilizado / serie incompleta: Yahoo empieza el 2025-12-08, después de su salida'
  WHERE indice = 'NDX' AND simbolo = 'MICC' AND nombre = 'Millicom International Cellular' AND desde = '2008-01-01';
UPDATE public.universo_miembros SET excluido_motivo = 'ticker reutilizado / serie incompleta: Yahoo empieza el 2023-09-14, después de su salida'
  WHERE indice = 'NDX' AND simbolo = 'SHLD' AND nombre = 'Sears Holdings' AND desde = '2008-01-01';
UPDATE public.universo_miembros SET excluido_motivo = 'ticker reutilizado / serie incompleta: Yahoo empieza el 2025-02-13, después de su salida'
  WHERE indice = 'NDX' AND simbolo = 'SNDK' AND nombre = 'Sandisk' AND desde = '2008-01-01';
UPDATE public.universo_miembros SET excluido_motivo = 'ticker reutilizado / serie incompleta: Yahoo empieza el 2026-01-16, después de su salida'
  WHERE indice = 'NDX' AND simbolo = 'SPLS' AND nombre = 'Staples' AND desde = '2008-01-01';
UPDATE public.universo_miembros SET excluido_motivo = 'ticker reutilizado / serie incompleta: Yahoo empieza el 2026-01-29, después de su salida'
  WHERE indice = 'NDX' AND simbolo = 'LIFE' AND nombre = 'Life Technologies' AND desde = '2008-12-22';
UPDATE public.universo_miembros SET excluido_motivo = 'ticker reutilizado / serie incompleta: Yahoo empieza el 2019-03-12, después de entrar (2009-01-20) y sin salir a bolsa ese año'
  WHERE indice = 'NDX' AND simbolo = 'FOXA' AND nombre = 'Fox Corporation' AND desde = '2009-01-20';
UPDATE public.universo_miembros SET excluido_motivo = 'ticker reutilizado / serie incompleta: Yahoo empieza el 2025-02-13, después de su salida'
  WHERE indice = 'NDX' AND simbolo = 'SNDK' AND nombre = 'Sandisk' AND desde = '2009-12-21';
UPDATE public.universo_miembros SET excluido_motivo = 'ticker reutilizado / serie incompleta: Yahoo empieza el 2014-03-17, después de su salida'
  WHERE indice = 'NDX' AND simbolo = 'GOLD' AND nombre = 'Randgold Resources' AND desde = '2011-12-19';
UPDATE public.universo_miembros SET excluido_motivo = 'ticker reutilizado / serie incompleta: Yahoo empieza el 2026-08-04, después de su salida'
  WHERE indice = 'NDX' AND simbolo = 'EA' AND nombre = 'Electronic Arts' AND desde = '2014-12-22';
UPDATE public.universo_miembros SET excluido_motivo = 'ticker reutilizado / serie incompleta: Yahoo empieza el 2019-03-13, después de entrar (2014-12-22) y sin salir a bolsa ese año'
  WHERE indice = 'NDX' AND simbolo = 'FOX' AND nombre = 'Fox Corporation' AND desde = '2014-12-22';
UPDATE public.universo_miembros SET excluido_motivo = 'ticker reutilizado / serie incompleta: Yahoo empieza el 2026-10-05, después de entrar (2022-12-19) y sin salir a bolsa ese año'
  WHERE indice = 'NDX' AND simbolo = 'WBD' AND nombre = 'Warner Bros. Discovery' AND desde = '2022-12-19';
UPDATE public.universo_miembros SET excluido_motivo = 'serie de precios no creíble'
  WHERE indice = 'NDX' AND simbolo = 'VIP' AND nombre = 'VimpelCom' AND desde = '2013-10-29';
