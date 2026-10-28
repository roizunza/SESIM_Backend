-- Ciclo 3 -- Bloque MESO territorial: unidad_territorial (municipios y localidades,
-- 2,785 en la carga oficial) y su geometria (0..1 por unidad).
-- Llaves: la CVEGEO de INEGI tal cual (5 digitos municipio, 9 localidad); no se inventa clave.

create table core.unidad_territorial (
  id         varchar(9) primary key
             check (id ~ '^04[0-9]{3}([0-9]{4})?$'),
  id_padre   varchar(9) references core.unidad_territorial(id),
  nivel      text not null check (nivel in ('municipio','localidad')),
  cve_ent    char(2) not null default '04' check (cve_ent = '04'),
  nom_ent    text not null default 'Campeche',
  cve_mun    char(3) not null check (cve_mun ~ '^(00[1-9]|01[0-3])$'),
  nom_mun    text not null check (btrim(nom_mun) <> ''),
  cve_loc    char(4) not null check (cve_loc ~ '^[0-9]{4}$'),
  nom_loc    text not null check (btrim(nom_loc) <> ''),
  pob_tot    integer not null check (pob_tot >= 0),
  cvegeo     varchar(9) not null check (cvegeo ~ '^04[0-9]{3}([0-9]{4})?$'),
  activo     boolean not null default true,
  -- municipio: sin padre, cve_loc 0000, id de 5 digitos.
  -- localidad: con padre (el municipio donde esta hoy), id de 9 digitos que termina en su cve_loc.
  constraint unidad_jerarquia check (
    (nivel = 'municipio' and id_padre is null and cve_loc = '0000' and length(id) = 5 and cvegeo = id)
    or
    (nivel = 'localidad' and id_padre is not null and length(id) = 9 and right(id, 4) = cve_loc and cve_loc <> '0000')
  )
);
create index unidad_territorial_padre_idx on core.unidad_territorial (id_padre);
create index unidad_territorial_mun_idx   on core.unidad_territorial (cve_mun);

create table core.unidad_territorial_geom (
  id_unidad  varchar(9) primary key references core.unidad_territorial(id) on delete cascade,
  geom       geometry(MultiPolygon, 4326) not null check (st_isvalid(geom))
);
create index unidad_territorial_geom_gix on core.unidad_territorial_geom using gist (geom);
