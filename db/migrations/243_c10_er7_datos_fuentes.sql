-- 243_c10_er7_datos_fuentes.sql
-- ER-7 -- Carga inicial de la Consulta oficial: las 10 fuentes y sus enlaces que hoy publica el front (front/public/sesim/catalogo/fuente_documental.json).
-- Es una carga, no un cambio hecho por una persona: la auditoria se pausa solo para esta insercion (igual que en la 241).
-- Politica de siembra (decision de Ismael, 14-nov-2026): las 10 fuentes entran publicadas (vigente_publico), con estatus_verificacion por_validar
-- (asi venian). La institucion NO se inventa: queda vacia para que la capture administracion. Desde aqui todo cambio pasa por D-20 / D-16.
alter table core.fuente_documental disable trigger user;
alter table core.enlace_fuente disable trigger user;

insert into core.fuente_documental (id, nombre, tipo_informacion, subtipo, seccion_banco, estatus_verificacion, estatus_documental, descripcion, uso_sesim, cobertura_geografica, cobertura_temporal, variables, limitaciones, estatus, publicado, publicado_en, activo)
select v.*, 'vigente_publico', true, now(), true from (values
  ('DAT-F001', 'Accidentes de Tránsito Terrestre en Zonas Urbanas y Suburbanas (ATUS)', 'estadistica', 'Desagregación estatal y municipal', '5.1', 'por_validar', 'Fuente oficial INEGI', null, 'Siniestralidad vial, distribución territorial, temporalidad, tipo de colisión y víctimas.', 'Nacional · Desagregación estatal y municipal', '1997–2025.', 'Fecha, hora, mes, tipo y causa del accidente, clase de accidente, características del conductor, tipo de vehículo, víctimas, entidad y municipio.', 'ATUS se refiere a accidentes en zonas urbanas y suburbanas; no representa por sí solo todos los siniestros carreteros.'),
  ('DAT-F002', 'Estadísticas de Defunciones Registradas (EDR)', 'estadistica', 'Desagregación territorial', '5.1', 'por_validar', 'Fuente oficial INEGI', null, 'Mortalidad por siniestros de tránsito, perfiles de víctimas y análisis territorial.', 'Nacional · Desagregación territorial', null, 'Causa básica de defunción, edad, sexo, lugar de ocurrencia y registro, entidad y municipio.', 'Usar códigos CIE-10 pertinentes. No sumar directamente las defunciones EDR con víctimas ATUS: son operaciones distintas.'),
  ('DAT-F003', 'Vehículos de Motor Registrados en Circulación (VMRC)', 'estadistica', 'Entidad', '5.1', 'por_validar', 'Fuente oficial INEGI', null, 'Composición y crecimiento del parque vehicular registrado.', 'Nacional · Entidad', 'Datos mensuales de 2025 en el recurso de metadatos.', 'Automóviles particulares y públicos, camiones para pasajeros y carga; modalidad pública o particular, según disponibilidad.', null),
  ('DAT-F004', 'Encuesta Intercensal 2025 (EIC)', 'estadistica', 'Desagregación según diseño estadístico', '5.1', 'por_validar', 'Fuente oficial INEGI', null, 'Población, vivienda y características sociodemográficas como denominadores para tasas y análisis de accesibilidad.', 'Nacional · Desagregación según diseño estadístico', null, null, 'Verificar cuestionarios y disponibilidad de cada variable antes de incorporarla. No asumir que incluye un reparto modal comparable con una encuesta origen-destino.'),
  ('DAT-F005', 'Censo de Población y Vivienda 2020', 'estadistica', 'AGEB / manzana / localidad, según producto', '5.1', 'por_validar', 'Fuente oficial INEGI', null, 'Población, vivienda y condiciones sociodemográficas; cuestionarios y productos específicos permiten identificar variables de movilidad cotidiana.', 'Nacional · AGEB / manzana / localidad, según producto', null, null, 'Documentar el cuestionario, la cobertura y el año de referencia. No presentar datos de 2020 como patrones actuales sin advertencia.'),
  ('DAT-G001', 'Marco Geoestadístico 2025 – INEGI', 'geoespacial', 'Geográfica', '5.2', 'por_validar', 'Fuente oficial', 'Límites estatales y municipales, localidades, AGEB y manzanas, además de claves geoestadísticas.', 'Homologación territorial y vinculación de indicadores con geometrías.', 'Nacional · Geográfica', null, null, null),
  ('DAT-G002', 'Red Nacional de Caminos (RNC) – INEGI', 'geoespacial', 'Lineal', '5.2', 'por_validar', 'Fuente oficial', 'Red de caminos, conectividad, características de infraestructura y elementos asociados a la circulación.', 'Conectividad regional, accesibilidad territorial, continuidad de rutas y articulación entre localidades.', 'Nacional · Lineal', null, null, 'No sustituye inventario municipal de banquetas, cruces, ciclovías ni vialidades de barrio.'),
  ('DAT-G003', 'Datos Viales – SICT', 'geoespacial', 'Carreteras', '5.2', 'por_validar', 'Fuente oficial', 'Aforos vehiculares, tránsito diario promedio anual, composición vehicular y estaciones de conteo.', 'Intensidad de circulación y demanda sobre corredores carreteros.', 'Nacional · Carreteras', null, null, 'Distinguir carreteras federales de calles urbanas y registrar año y estación.'),
  ('DAT-G004', 'Directorio Estadístico Nacional de Unidades Económicas (DENUE)', 'geoespacial', 'Puntual / establecimiento', '5.2', 'por_validar', 'Fuente oficial INEGI', 'Establecimientos económicos, ubicación, actividad y características generales.', 'Atractores de viajes, centralidades y distribución espacial de servicios.', 'Nacional · Puntual / establecimiento', null, null, 'No mide directamente demanda de transporte ni viajes.'),
  ('DAT-G005', 'Información de transporte público – ARTEC', 'geoespacial', 'Transporte público', '5.2', 'por_validar', 'Fuente institucional', null, 'Capas de rutas, paradas, cobertura, modalidades, servicios y horarios.', null, null, null, 'El portal no acredita por sí mismo la integridad de un inventario geográfico estatal. Solicitar catálogo validado con identificadores, geometrías, concesiones, horarios, vigencia y actualización.')
) as v(id, nombre, tipo_informacion, subtipo, seccion_banco, estatus_verificacion, estatus_documental, descripcion, uso_sesim, cobertura_geografica, cobertura_temporal, variables, limitaciones);

insert into core.enlace_fuente (id_fuente, orden, titulo, url) values
  ('DAT-F001', 1, 'Consulta ATUS', 'https://www.inegi.org.mx/sistemas/olap/proyectos/bd/continuas/transporte/accidentes.asp'),
  ('DAT-F002', 1, 'Programa EDR', 'https://www.inegi.org.mx/programas/edr/'),
  ('DAT-F003', 1, 'Metadatos VMRC 2025', 'https://www.inegi.org.mx/rnm/index.php/catalog/1071/data-dictionary/F23'),
  ('DAT-F003', 2, 'Programa VMRC', 'https://www.inegi.org.mx/programas/vehiculosmotor/'),
  ('DAT-F004', 1, 'EIC 2025', 'https://www.inegi.org.mx/programas/eic/2025/'),
  ('DAT-F005', 1, 'Censo 2020', 'https://www.inegi.org.mx/programas/ccpv/2020/'),
  ('DAT-G001', 1, 'Descarga Marco Geoestadístico', 'https://www.inegi.org.mx/temas/mg/'),
  ('DAT-G002', 1, 'Programa RNC', 'https://www.inegi.org.mx/programas/rnc/'),
  ('DAT-G003', 1, 'Datos Viales – Datos Abiertos', 'https://www.datos.gob.mx/dataset/datos_viales'),
  ('DAT-G004', 1, 'DENUE – mapa interactivo', 'https://www.inegi.org.mx/app/mapa/denue/default.aspx'),
  ('DAT-G005', 1, 'Portal ARTEC', 'https://artec.campeche.gob.mx/');

alter table core.fuente_documental enable trigger user;
alter table core.enlace_fuente enable trigger user;
