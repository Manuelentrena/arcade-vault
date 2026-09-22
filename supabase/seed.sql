-- Semilla determinista del stack local.
--
-- Un único usuario ya confirmado: lo usan el helper signIn() de la suite y las
-- capturas de /jugar/[id], que desde SPEC 06 es una ruta protegida. Crearlo
-- desde el test daría un estado distinto en cada ejecución.
--
-- El trigger on_auth_user_created le crea su fila en public.profiles con
-- username = 'PX_KAI' (el nombre que ya usaban los tests).

-- Las columnas de token van a cadena vacía, no a NULL: GoTrue las lee como
-- string y con NULL responde 500 «Database error querying schema» a cualquier
-- inicio de sesión.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new,
  email_change, email_change_token_current, reauthentication_token
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated',
  'px_kai@vault.test', crypt('arcade-vault-test', gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}',
  '{"username":"PX_KAI"}', now(), now(),
  '', '', '', '', '', ''
);

-- Sin fila en auth.identities, signInWithPassword no encuentra al usuario.
insert into auth.identities (
  provider_id, user_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
) values (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  '{"sub":"00000000-0000-4000-8000-000000000001","email":"px_kai@vault.test","email_verified":true,"phone_verified":false}',
  'email',
  now(), now(), now()
);
