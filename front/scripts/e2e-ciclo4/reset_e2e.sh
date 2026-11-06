#!/bin/bash
psql -h /tmp -p 5433 -U postgres -d postgres -qAtc "drop database if exists sesim_e2e" -c "create database sesim_e2e template sesim" >/dev/null
psql -h /tmp -p 5433 -U postgres -d sesim_e2e -X -q <<'SQL'
insert into auth.users (id, email) select gen_random_uuid(), e from unnest(array['tit@e2e.mx','adm@e2e.mx','adm2@e2e.mx','cap@e2e.mx','aud@e2e.mx']) e;
insert into core.perfil (id_usuario, nombre, rol, creado_en)
select id, case email when 'tit@e2e.mx' then 'Titular E2E' when 'adm@e2e.mx' then 'Administrador E2E' when 'adm2@e2e.mx' then 'Administrador 2 E2E' when 'cap@e2e.mx' then 'Capturista E2E' else 'Auditor E2E' end,
 case email when 'tit@e2e.mx' then 'administrador_titular' when 'aud@e2e.mx' then 'auditor' when 'cap@e2e.mx' then 'capturista' else 'administrador' end, now() - interval '30 days'
from auth.users where email like '%@e2e.mx';
SQL
