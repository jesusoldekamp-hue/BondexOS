insert into tenant (id, nombre, plan)
values
  ('00000000-0000-4000-8000-000000000001', 'Afianzadora Demo', 'piloto')
on conflict (id) do nothing;

-- Estos usuarios quedan sin auth_user_id para permitir vincularlos por invitacion.
-- En un entorno Supabase real, el API creara/vinculara auth.users con inviteUserByEmail.
insert into usuario (tenant_id, rol, email, nombre, activo)
values
  ('00000000-0000-4000-8000-000000000001', 'admin', 'admin@afianzadora.demo', 'Admin Demo', true),
  ('00000000-0000-4000-8000-000000000001', 'suscriptor', 'suscriptor@afianzadora.demo', 'Suscriptor Demo', true),
  ('00000000-0000-4000-8000-000000000001', 'auditor', 'auditor@afianzadora.demo', 'Auditor Demo', true)
on conflict do nothing;
