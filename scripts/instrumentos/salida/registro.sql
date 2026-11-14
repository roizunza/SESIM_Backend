-- Generado por cargar_pdfs.py: registra los PDF ya subidos al bucket `instrumentos`.
-- Se corre con el rol dueño (sin sesion de usuario). Es seguro repetirlo: lo ya registrado se omite.
begin;
select case when exists (select 1 from core.documento_instrumento where id_instrumento = 'DOC-E001' and hash_archivo = 'bea144a13e6a2039036f39bcfd5a99ead7de617eae041684b15b95a5ec944e9e')
  then jsonb_build_object('omitido', 'DOC-E001') else core.registrar_documento_carga_inicial('DOC-E001', 'principal', 'bea144a13e6a2039036f39bcfd5a99ead7de617eae041684b15b95a5ec944e9e', 941604, 100, true) end;
select case when exists (select 1 from core.documento_instrumento where id_instrumento = 'DOC-E002' and hash_archivo = '6aff61b02971f9d40530431edc41f98462413907286d8a7ad82eaef704f524a1')
  then jsonb_build_object('omitido', 'DOC-E002') else core.registrar_documento_carga_inicial('DOC-E002', 'principal', '6aff61b02971f9d40530431edc41f98462413907286d8a7ad82eaef704f524a1', 697323, 61, true) end;
select case when exists (select 1 from core.documento_instrumento where id_instrumento = 'DOC-E003' and hash_archivo = '2b9e7800362d529b74f1e43453f3c3773b1583ba19b3a5ec6e0108ce9b44d2e6')
  then jsonb_build_object('omitido', 'DOC-E003') else core.registrar_documento_carga_inicial('DOC-E003', 'principal', '2b9e7800362d529b74f1e43453f3c3773b1583ba19b3a5ec6e0108ce9b44d2e6', 857165, 87, true) end;
select case when exists (select 1 from core.documento_instrumento where id_instrumento = 'DOC-E004' and hash_archivo = '9de514f54e886f3c21c0783f5ee4ba779b4c34837fdb2905e168a62367440841')
  then jsonb_build_object('omitido', 'DOC-E004') else core.registrar_documento_carga_inicial('DOC-E004', 'principal', '9de514f54e886f3c21c0783f5ee4ba779b4c34837fdb2905e168a62367440841', 1543806, 182, true) end;
select case when exists (select 1 from core.documento_instrumento where id_instrumento = 'DOC-E005' and hash_archivo = 'bb24e48578db42769c3e2d0d316926a560905b000293164d13fb07b8ab02904d')
  then jsonb_build_object('omitido', 'DOC-E005') else core.registrar_documento_carga_inicial('DOC-E005', 'principal', 'bb24e48578db42769c3e2d0d316926a560905b000293164d13fb07b8ab02904d', 406706, 32, true) end;
select case when exists (select 1 from core.documento_instrumento where id_instrumento = 'DOC-E006' and hash_archivo = '0cd4c8d68b7ad817c16dd349e0bce057c03554ce85004e5382a183b6571934c2')
  then jsonb_build_object('omitido', 'DOC-E006') else core.registrar_documento_carga_inicial('DOC-E006', 'principal', '0cd4c8d68b7ad817c16dd349e0bce057c03554ce85004e5382a183b6571934c2', 19409432, 322, true) end;
select case when exists (select 1 from core.documento_instrumento where id_instrumento = 'DOC-E006' and hash_archivo = '892a70608f05e515504cb591cbe4cf22abd394954a266b02f9ff21f63310c244')
  then jsonb_build_object('omitido', 'DOC-E006') else core.registrar_documento_carga_inicial('DOC-E006', 'complemento', '892a70608f05e515504cb591cbe4cf22abd394954a266b02f9ff21f63310c244', 13831191, 50, false) end;
select case when exists (select 1 from core.documento_instrumento where id_instrumento = 'DOC-E007' and hash_archivo = '8e2ee25bb7b4bd29921f3ee38066b76265f568aeba91927320bc386ce4e0056e')
  then jsonb_build_object('omitido', 'DOC-E007') else core.registrar_documento_carga_inicial('DOC-E007', 'principal', '8e2ee25bb7b4bd29921f3ee38066b76265f568aeba91927320bc386ce4e0056e', 27234604, 277, true) end;
select case when exists (select 1 from core.documento_instrumento where id_instrumento = 'DOC-E008' and hash_archivo = 'cc8f87ba21be60ed45fc319ac7d34ab4a20cf3ea36e5d5989b10fcf6df471eef')
  then jsonb_build_object('omitido', 'DOC-E008') else core.registrar_documento_carga_inicial('DOC-E008', 'principal', 'cc8f87ba21be60ed45fc319ac7d34ab4a20cf3ea36e5d5989b10fcf6df471eef', 60823542, 724, true) end;
select case when exists (select 1 from core.documento_instrumento where id_instrumento = 'DOC-E009' and hash_archivo = '5f44ce289cebef0497ab9fbf0725ffc1fd7124b3815a9bd5cf89dca818b1cc1d')
  then jsonb_build_object('omitido', 'DOC-E009') else core.registrar_documento_carga_inicial('DOC-E009', 'principal', '5f44ce289cebef0497ab9fbf0725ffc1fd7124b3815a9bd5cf89dca818b1cc1d', 3678752, 148, true) end;
select case when exists (select 1 from core.documento_instrumento where id_instrumento = 'DOC-F001' and hash_archivo = 'cefb525ae8dfc97a7da40597d2ee918fe254d4bfce88301ff3c9959ced9e6e65')
  then jsonb_build_object('omitido', 'DOC-F001') else core.registrar_documento_carga_inicial('DOC-F001', 'principal', 'cefb525ae8dfc97a7da40597d2ee918fe254d4bfce88301ff3c9959ced9e6e65', 3146661, 416, true) end;
select case when exists (select 1 from core.documento_instrumento where id_instrumento = 'DOC-F002' and hash_archivo = '79f2b255a142d1756d7e8c13244af6dc8c4f2f474acaf0d669f2b156b022fc03')
  then jsonb_build_object('omitido', 'DOC-F002') else core.registrar_documento_carga_inicial('DOC-F002', 'principal', '79f2b255a142d1756d7e8c13244af6dc8c4f2f474acaf0d669f2b156b022fc03', 639876, 50, true) end;
select case when exists (select 1 from core.documento_instrumento where id_instrumento = 'DOC-F003' and hash_archivo = 'dd294df803cf4a31421f3533f6fd4be308305d6e6f43a89a07e6a30d72d0ddd5')
  then jsonb_build_object('omitido', 'DOC-F003') else core.registrar_documento_carga_inicial('DOC-F003', 'principal', 'dd294df803cf4a31421f3533f6fd4be308305d6e6f43a89a07e6a30d72d0ddd5', 653615, 58, true) end;
select case when exists (select 1 from core.documento_instrumento where id_instrumento = 'DOC-F004' and hash_archivo = '0574853d06020030188e8aee1eae5dabb2b476ac630cc52be631a48d2b91adbc')
  then jsonb_build_object('omitido', 'DOC-F004') else core.registrar_documento_carga_inicial('DOC-F004', 'principal', '0574853d06020030188e8aee1eae5dabb2b476ac630cc52be631a48d2b91adbc', 1357460, 154, true) end;
select case when exists (select 1 from core.documento_instrumento where id_instrumento = 'DOC-F005' and hash_archivo = 'e979df2c69d356cde7133debb81e8b628a828b57348cf023fa9dcc54a5682849')
  then jsonb_build_object('omitido', 'DOC-F005') else core.registrar_documento_carga_inicial('DOC-F005', 'principal', 'e979df2c69d356cde7133debb81e8b628a828b57348cf023fa9dcc54a5682849', 8908335, 212, true) end;
select case when exists (select 1 from core.documento_instrumento where id_instrumento = 'DOC-F006' and hash_archivo = '11759348dc5b1c4b36387ad994ac84ffaf171591b4624a53cbeb056f5dfd0c5c')
  then jsonb_build_object('omitido', 'DOC-F006') else core.registrar_documento_carga_inicial('DOC-F006', 'principal', '11759348dc5b1c4b36387ad994ac84ffaf171591b4624a53cbeb056f5dfd0c5c', 19487397, 268, true) end;
select case when exists (select 1 from core.documento_instrumento where id_instrumento = 'DOC-F007' and hash_archivo = 'f2c0db050783f6b52adb96c45b7fb581b4ee4e0b90b8bf2a9b060c008962386a')
  then jsonb_build_object('omitido', 'DOC-F007') else core.registrar_documento_carga_inicial('DOC-F007', 'principal', 'f2c0db050783f6b52adb96c45b7fb581b4ee4e0b90b8bf2a9b060c008962386a', 8052330, 82, true) end;
select case when exists (select 1 from core.documento_instrumento where id_instrumento = 'DOC-M001' and hash_archivo = 'e1c39d3be7d23178f13a0a887295d342a9c7eb58700f351ac87cce13e6bbb440')
  then jsonb_build_object('omitido', 'DOC-M001') else core.registrar_documento_carga_inicial('DOC-M001', 'principal', 'e1c39d3be7d23178f13a0a887295d342a9c7eb58700f351ac87cce13e6bbb440', 4679966, 320, true) end;
select case when exists (select 1 from core.documento_instrumento where id_instrumento = 'DOC-M002' and hash_archivo = '97722e187c6029787efc33449f98aaf554d8e75a3a0ad75fc72a2431b34a6622')
  then jsonb_build_object('omitido', 'DOC-M002') else core.registrar_documento_carga_inicial('DOC-M002', 'principal', '97722e187c6029787efc33449f98aaf554d8e75a3a0ad75fc72a2431b34a6622', 16029232, 380, true) end;
select case when exists (select 1 from core.documento_instrumento where id_instrumento = 'DOC-M003' and hash_archivo = '5dee48626f1227db4eae62d479ac272de2531af893f51e6a62ca49b05838572e')
  then jsonb_build_object('omitido', 'DOC-M003') else core.registrar_documento_carga_inicial('DOC-M003', 'principal', '5dee48626f1227db4eae62d479ac272de2531af893f51e6a62ca49b05838572e', 17069157, 252, true) end;
select case when exists (select 1 from core.documento_instrumento where id_instrumento = 'DOC-M004' and hash_archivo = '1fe9b76271e52ae0e8f76490985a85c5abc504c8ac2632db23d1ca3addd37707')
  then jsonb_build_object('omitido', 'DOC-M004') else core.registrar_documento_carga_inicial('DOC-M004', 'principal', '1fe9b76271e52ae0e8f76490985a85c5abc504c8ac2632db23d1ca3addd37707', 23817872, 548, true) end;
select case when exists (select 1 from core.documento_instrumento where id_instrumento = 'DOC-M005' and hash_archivo = '74cc2442a7013153b63364a75c5bdfba8f113880628502961d6d459285763a05')
  then jsonb_build_object('omitido', 'DOC-M005') else core.registrar_documento_carga_inicial('DOC-M005', 'principal', '74cc2442a7013153b63364a75c5bdfba8f113880628502961d6d459285763a05', 32558847, 688, true) end;
select case when exists (select 1 from core.documento_instrumento where id_instrumento = 'DOC-M006' and hash_archivo = 'c58539bc50ee65bb45570e1af579e2453fee566ad870dba4d0d623f7eb8f37c1')
  then jsonb_build_object('omitido', 'DOC-M006') else core.registrar_documento_carga_inicial('DOC-M006', 'principal', 'c58539bc50ee65bb45570e1af579e2453fee566ad870dba4d0d623f7eb8f37c1', 36406227, 372, true) end;
select case when exists (select 1 from core.documento_instrumento where id_instrumento = 'DOC-M007' and hash_archivo = 'f311b6ecd98be2c9ad4f3c22dbc3715140ee4909d9cc1ce42fbd71a146545769')
  then jsonb_build_object('omitido', 'DOC-M007') else core.registrar_documento_carga_inicial('DOC-M007', 'principal', 'f311b6ecd98be2c9ad4f3c22dbc3715140ee4909d9cc1ce42fbd71a146545769', 12904946, 253, true) end;
select case when exists (select 1 from core.documento_instrumento where id_instrumento = 'DOC-M008' and hash_archivo = 'd36d1805e0b661c5048f37a366a52a735708c702add5c1cbe92a2876c0c81965')
  then jsonb_build_object('omitido', 'DOC-M008') else core.registrar_documento_carga_inicial('DOC-M008', 'principal', 'd36d1805e0b661c5048f37a366a52a735708c702add5c1cbe92a2876c0c81965', 12729185, 344, true) end;
select case when exists (select 1 from core.documento_instrumento where id_instrumento = 'DOC-M009' and hash_archivo = '10cb16296709262b648da62999e91a32a31cfde82342f50536a872a34362a8ca')
  then jsonb_build_object('omitido', 'DOC-M009') else core.registrar_documento_carga_inicial('DOC-M009', 'principal', '10cb16296709262b648da62999e91a32a31cfde82342f50536a872a34362a8ca', 9651537, 30, false) end;
select case when exists (select 1 from core.documento_instrumento where id_instrumento = 'DOC-M010' and hash_archivo = '8da1e88add9645b3de795ae5ee259dc2a6bfc8217c732df67ae201919e6fafa6')
  then jsonb_build_object('omitido', 'DOC-M010') else core.registrar_documento_carga_inicial('DOC-M010', 'principal', '8da1e88add9645b3de795ae5ee259dc2a6bfc8217c732df67ae201919e6fafa6', 17237896, 384, true) end;
select case when exists (select 1 from core.documento_instrumento where id_instrumento = 'DOC-M011' and hash_archivo = '17e0cdf3da7ebdf1ea329c384194756f8c2c64d4d5620b846c9fddbb330caf51')
  then jsonb_build_object('omitido', 'DOC-M011') else core.registrar_documento_carga_inicial('DOC-M011', 'principal', '17e0cdf3da7ebdf1ea329c384194756f8c2c64d4d5620b846c9fddbb330caf51', 145909669, 657, false) end;
select case when exists (select 1 from core.documento_instrumento where id_instrumento = 'DOC-M012' and hash_archivo = '74edbc02b3c70b6a7a13b36f56da53bbc9da4e87672ad07deeedced85516badd')
  then jsonb_build_object('omitido', 'DOC-M012') else core.registrar_documento_carga_inicial('DOC-M012', 'principal', '74edbc02b3c70b6a7a13b36f56da53bbc9da4e87672ad07deeedced85516badd', 120427889, 550, false) end;
select case when exists (select 1 from core.documento_instrumento where id_instrumento = 'DOC-M013' and hash_archivo = 'efb2dfb17cc3c13146f0bfd9205abab99774281586fcc5441c1aa0a9e42e2aea')
  then jsonb_build_object('omitido', 'DOC-M013') else core.registrar_documento_carga_inicial('DOC-M013', 'principal', 'efb2dfb17cc3c13146f0bfd9205abab99774281586fcc5441c1aa0a9e42e2aea', 75040602, 641, true) end;
select case when exists (select 1 from core.documento_instrumento where id_instrumento = 'DOC-M014' and hash_archivo = 'fc2da75796697e9074af38563b4f3aca4bbff48e1f9958e9bf69ccee9243d7fc')
  then jsonb_build_object('omitido', 'DOC-M014') else core.registrar_documento_carga_inicial('DOC-M014', 'principal', 'fc2da75796697e9074af38563b4f3aca4bbff48e1f9958e9bf69ccee9243d7fc', 104131284, 545, false) end;
select case when exists (select 1 from core.documento_instrumento where id_instrumento = 'DOC-M015' and hash_archivo = 'fd51e8f14e415506535a5ae712a3a062beeeca1fb7772ed173c098c54ce50821')
  then jsonb_build_object('omitido', 'DOC-M015') else core.registrar_documento_carga_inicial('DOC-M015', 'principal', 'fd51e8f14e415506535a5ae712a3a062beeeca1fb7772ed173c098c54ce50821', 127407868, 680, true) end;
select case when exists (select 1 from core.documento_instrumento where id_instrumento = 'DOC-N001' and hash_archivo = 'd684a347ac408684d59b7b36ac0b05e735fd0dbfb211e3df1008b5f94195d70c')
  then jsonb_build_object('omitido', 'DOC-N001') else core.registrar_documento_carga_inicial('DOC-N001', 'principal', 'd684a347ac408684d59b7b36ac0b05e735fd0dbfb211e3df1008b5f94195d70c', 8448627, 122, true) end;
select case when exists (select 1 from core.documento_instrumento where id_instrumento = 'DOC-N002' and hash_archivo = '07ecf59bea490b821e1d4f75f4256d85e7aefdab43d4c8bf93ac804af942df78')
  then jsonb_build_object('omitido', 'DOC-N002') else core.registrar_documento_carga_inicial('DOC-N002', 'principal', '07ecf59bea490b821e1d4f75f4256d85e7aefdab43d4c8bf93ac804af942df78', 2790969, 72, true) end;
select case when exists (select 1 from core.documento_instrumento where id_instrumento = 'DOC-N003' and hash_archivo = '4404718026bcf0cf9b303c928b16c15219a30ac8a582f5bf3a965bc0553fdcb7')
  then jsonb_build_object('omitido', 'DOC-N003') else core.registrar_documento_carga_inicial('DOC-N003', 'principal', '4404718026bcf0cf9b303c928b16c15219a30ac8a582f5bf3a965bc0553fdcb7', 2133886, 33, true) end;
select case when exists (select 1 from core.documento_instrumento where id_instrumento = 'DOC-N004' and hash_archivo = 'b8a1e0c1db6c8fafbfc695712e533c54bc52df1e345054da6d0e6393f947022f')
  then jsonb_build_object('omitido', 'DOC-N004') else core.registrar_documento_carga_inicial('DOC-N004', 'principal', 'b8a1e0c1db6c8fafbfc695712e533c54bc52df1e345054da6d0e6393f947022f', 1024311, 28, true) end;
select case when exists (select 1 from core.documento_instrumento where id_instrumento = 'DOC-N005' and hash_archivo = '3f49ba8b3ba0cd69cd632ecf299f81fea5c61166f1811e61556b505bcd52d7b2')
  then jsonb_build_object('omitido', 'DOC-N005') else core.registrar_documento_carga_inicial('DOC-N005', 'principal', '3f49ba8b3ba0cd69cd632ecf299f81fea5c61166f1811e61556b505bcd52d7b2', 772397, 24, true) end;
commit;
