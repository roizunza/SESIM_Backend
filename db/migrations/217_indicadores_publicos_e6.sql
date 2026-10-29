-- Ciclo 3 (ajuste E-6) -- El catalogo de indicadores es PUBLICO completo (los 113 activos), no solo los aprobados.
-- Motivo (Ismael, 28-oct-2026): el dashboard publico debe mostrar el catalogo completo; la aprobacion de la
-- ficha sigue siendo un dato visible (estatus_aprobado) y sigue mandando donde importa: la compuerta
-- de aprobacion (CHECK indicador_compuerta_aprobacion) y la captura de mediciones (solo sobre indicadores
-- aprobados). Esto REVIERTE solo la parte de la migracion 215 que filtraba indicadores por aprobacion.
-- Sigue sin exponerse ningun dato de personas ni mediciones no publicadas.

drop policy if exists indicador_select_publico on core.indicador;
create policy indicador_select_publico on core.indicador for select to anon
  using (activo);

-- indicador_eje e indicador_instrumento ya dependen de que el indicador sea visible (subselect con RLS):
-- al ampliarse la visibilidad del indicador se amplian solos. capa_indicador depende de la capa publica.
comment on policy indicador_select_publico on core.indicador is
  'Lectura publica del catalogo de indicadores activos (E-6). La aprobacion de la ficha es un dato visible, no un filtro.';
