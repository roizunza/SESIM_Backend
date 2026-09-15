-- Ciclo 3 -- Capa 2 ("el corazon de la plataforma"): captura de valores
-- reales de indicadores.
--
-- Hoy "no existe todavia ningun lugar donde capturar y guardar un valor
-- real de un indicador" (ver seccion 1 de la especificacion) -- este
-- archivo crea esa tabla. Estructura de las secciones 3.2/3.3 de
-- claude/ciclo-3-especificacion-base-datos.md, ajustada solo en el tipo
-- de la FK a indicador (texto, no entero -- ver 113_schema_core_indicador.sql
-- y seccion 6.1).
--
-- El versionado (observacion_historial + trigger OLD/NEW) es Capa 3, NO
-- este archivo -- ver seccion 3.4 de la especificacion. La columna
-- version SI va aqui (es una columna de observacion, no de su historial)
-- para no tener que alterar esta tabla cuando se construya Capa 3.
--
-- PENDIENTE A PROPOSITO: este archivo NO trae RLS ni vista api.* (esos
-- van en 116/117 junto con los catalogos de Capa 2, pero solo para
-- indicador/capa -- observacion se deja fuera de 116/117 hasta confirmar
-- la matriz real de permisos por rol
-- (capturista/administrador/administrador_vip/auditor) sobre esta tabla
-- especifica: quien inserta, quien edita una fila vigente, como se
-- filtra por cve_mun, y que tan publica es una fila segun su estatus
-- (vigente_publico vs las otras 4). Escribir esa RLS a ciegas es
-- exactamente el tipo de invencion que se pidio evitar en esta fase --
-- ver 118_rls_observacion.sql (todavia sin escribir).

create table core.observacion (
  id                bigint generated always as identity primary key,
  indicador_codigo  text    not null references core.indicador(codigo) on delete restrict,
  cve_mun           text references core.municipio(cve_mun) on delete restrict,
  periodo           integer not null,
  valor             numeric,
  estatus           text    not null default 'borrador',
  version           integer not null default 1,
  capturado_por     uuid references auth.users(id) on delete set null,
  creado_en         timestamptz not null default now(),

  constraint observacion_estatus_valido
    check (estatus in ('borrador', 'revision', 'vigente_admin', 'vigente_publico', 'rechazado'))
);

comment on table core.observacion is
  'Valor real capturado de un indicador, por periodo (y opcionalmente por municipio). El estatus de 5 valores marca el flujo borrador -> revision -> vigente_admin -> vigente_publico (o rechazado); el PROCESO real de captura/revision/dictamen es Ciclo 8 -- esta tabla solo define donde vive el dato y su estatus actual. RLS/api pendientes -- ver cabecera de este archivo.';
comment on column core.observacion.indicador_codigo is 'FK a core.indicador(codigo) -- texto, no entero (ver seccion 6.1: el codigo real del CSV es la llave natural).';
comment on column core.observacion.cve_mun is 'FK a core.municipio(cve_mun). Nullable: no todos los indicadores son por municipio -- un indicador estatal deja esta columna en null.';
comment on column core.observacion.periodo is 'Periodo del valor capturado (ej. anio). Sin formato fijo impuesto aqui -- a definir cuando se construya el proceso de captura real (Ciclo 8).';
comment on column core.observacion.valor is 'Valor numerico capturado. NULL permitido: dado que indicador.meta es mayoritariamente cualitativa (seccion 6.1), es una pregunta abierta si algun indicador necesita tambien un valor cualitativo aqui -- a confirmar antes de dar por cerrada esta columna.';
comment on column core.observacion.estatus is 'borrador | revision | vigente_admin | vigente_publico | rechazado. El proceso real que mueve una fila entre estos valores es Ciclo 8 -- aqui solo se declara el catalogo cerrado.';
comment on column core.observacion.version is 'Numero de version, para el trigger de versionado de Capa 3 (observacion_historial) -- se agrega ahora para no tener que alterar esta tabla despues.';
comment on column core.observacion.capturado_por is 'Quien capturo/edito esta version. FK a auth.users(id) (no a core.perfil(id)) -- mismo patron que core.bitacora.actor_id_usuario.';

create index observacion_indicador_idx on core.observacion (indicador_codigo);
create index observacion_cve_mun_idx on core.observacion (cve_mun);
create index observacion_estatus_idx on core.observacion (estatus);
