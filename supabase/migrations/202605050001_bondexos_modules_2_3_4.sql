create type ai_job_tipo as enum (
  'clasificar_documento',
  'extraer_datos',
  'validar_coherencia',
  'analizar_financiero',
  'analizar_patrimonial',
  'generar_memo'
);

create type ai_job_estado as enum (
  'pendiente',
  'en_proceso',
  'completado',
  'revision',
  'fallido'
);

alter table originador
  add column if not exists cedula_verificado_en timestamptz,
  add column if not exists cedula_fuente text,
  add column if not exists cedula_detalle text;

alter table documento
  add column if not exists nombre text,
  add column if not exists obligatorio boolean not null default true,
  add column if not exists condicion text,
  add column if not exists checklist_version text not null default '2026.05.modulo-3',
  add column if not exists orden integer not null default 0,
  add column if not exists r2_key text,
  add column if not exists content_type text,
  add column if not exists size_bytes integer check (size_bytes is null or size_bytes > 0),
  add column if not exists cargado_en timestamptz,
  add column if not exists rechazado_motivo text;

alter table expediente
  add column if not exists progreso_obligatorio integer not null default 0
    check (progreso_obligatorio >= 0 and progreso_obligatorio <= 100),
  add column if not exists submitted_at timestamptz,
  add column if not exists ai_estado ai_job_estado not null default 'pendiente';

create unique index if not exists documento_expediente_tipo_unique
  on documento (expediente_id, tipo);

create index if not exists documento_obligatorio_estado_idx
  on documento (tenant_id, expediente_id, obligatorio, estado);

create index if not exists originador_cedula_verificado_en_idx
  on originador (tenant_id, cedula_verificado_en);

create table brokerguard_verificacion (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id) on delete restrict,
  originador_id uuid not null,
  cedula_num text not null,
  estado cedula_estado not null,
  fuente text not null,
  verificado_en timestamptz not null default now(),
  vence date,
  detalle text,
  bloquea_operacion boolean not null default false,
  created_at timestamptz not null default now(),
  constraint brokerguard_originador_tenant_fk
    foreign key (originador_id, tenant_id)
    references originador(id, tenant_id)
    on delete cascade
);

create index brokerguard_verificacion_tenant_originador_idx
  on brokerguard_verificacion (tenant_id, originador_id, verificado_en desc);

create index brokerguard_verificacion_cedula_idx
  on brokerguard_verificacion (cedula_num, verificado_en desc);

create table ai_job (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id) on delete restrict,
  expediente_id uuid not null,
  documento_id uuid,
  tipo ai_job_tipo not null,
  estado ai_job_estado not null default 'pendiente',
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts > 0),
  payload_json jsonb not null default '{}'::jsonb,
  output_json jsonb not null default '{}'::jsonb,
  error_message text,
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_by uuid references usuario(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_job_expediente_tenant_fk
    foreign key (expediente_id, tenant_id)
    references expediente(id, tenant_id)
    on delete cascade,
  constraint ai_job_documento_tenant_fk
    foreign key (documento_id, tenant_id)
    references documento(id, tenant_id)
    on delete cascade
);

create index ai_job_tenant_expediente_idx
  on ai_job (tenant_id, expediente_id, created_at desc);

create index ai_job_estado_queued_idx
  on ai_job (estado, queued_at)
  where estado in ('pendiente', 'revision', 'fallido');

create trigger ai_job_set_updated_at
before update on ai_job
for each row execute function set_updated_at();

create or replace function refresh_expediente_progress(target_expediente_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  required_count integer;
  valid_count integer;
  target_tenant_id uuid;
begin
  select e.tenant_id
  into target_tenant_id
  from expediente e
  where e.id = target_expediente_id;

  if target_tenant_id is null then
    return;
  end if;

  select count(*), count(*) filter (where d.estado = 'validado')
  into required_count, valid_count
  from documento d
  where d.expediente_id = target_expediente_id
    and d.tenant_id = target_tenant_id
    and d.obligatorio = true;

  update expediente
  set progreso_obligatorio = case
      when required_count = 0 then 100
      else round((valid_count::numeric / required_count::numeric) * 100)::integer
    end,
    estado = case
      when required_count > 0
        and valid_count = required_count
        and estado in ('borrador', 'en_proceso', 'completo')
        then 'completo'::expediente_estado
      when required_count > 0
        and valid_count < required_count
        and estado in ('borrador', 'en_proceso', 'completo')
        then 'en_proceso'::expediente_estado
      else estado
    end
  where id = target_expediente_id;
end;
$$;

create or replace function documento_refresh_expediente_progress()
returns trigger
language plpgsql
as $$
begin
  perform refresh_expediente_progress(coalesce(new.expediente_id, old.expediente_id));
  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create trigger documento_refresh_progress_after_insert
after insert on documento
for each row execute function documento_refresh_expediente_progress();

create trigger documento_refresh_progress_after_update
after update of estado, obligatorio on documento
for each row execute function documento_refresh_expediente_progress();

create trigger documento_refresh_progress_after_delete
after delete on documento
for each row execute function documento_refresh_expediente_progress();

create or replace function prevent_incomplete_expediente_submission()
returns trigger
language plpgsql
as $$
declare
  missing_count integer;
begin
  if new.estado = 'en_suscripcion' and old.estado is distinct from new.estado then
    select count(*)
    into missing_count
    from documento d
    where d.expediente_id = new.id
      and d.tenant_id = new.tenant_id
      and d.obligatorio = true
      and d.estado <> 'validado';

    if missing_count > 0 then
      raise exception 'No se puede enviar a suscripcion con documentos obligatorios pendientes.';
    end if;

    new.submitted_at = coalesce(new.submitted_at, now());
  end if;

  return new;
end;
$$;

create trigger expediente_prevent_incomplete_submission
before update of estado on expediente
for each row execute function prevent_incomplete_expediente_submission();

alter table brokerguard_verificacion enable row level security;
alter table ai_job enable row level security;

alter table brokerguard_verificacion force row level security;
alter table ai_job force row level security;

create policy brokerguard_verificacion_select_access
on brokerguard_verificacion for select
to authenticated
using (
  tenant_id = current_tenant_id()
  and (
    current_usuario_rol() in ('admin', 'suscriptor', 'auditor')
    or exists (
      select 1
      from originador o
      where o.id = originador_id
        and o.tenant_id = tenant_id
        and o.usuario_id = current_usuario_id()
    )
  )
);

create policy brokerguard_verificacion_insert_operator
on brokerguard_verificacion for insert
to authenticated
with check (
  tenant_id = current_tenant_id()
  and current_usuario_rol() in ('admin', 'suscriptor')
);

create policy ai_job_select_access
on ai_job for select
to authenticated
using (tenant_id = current_tenant_id() and can_access_expediente(expediente_id));

create policy ai_job_insert_operator
on ai_job for insert
to authenticated
with check (
  tenant_id = current_tenant_id()
  and current_usuario_rol() in ('admin', 'suscriptor')
  and can_access_expediente(expediente_id)
);

create policy ai_job_update_operator
on ai_job for update
to authenticated
using (
  tenant_id = current_tenant_id()
  and current_usuario_rol() in ('admin', 'suscriptor')
  and can_access_expediente(expediente_id)
)
with check (
  tenant_id = current_tenant_id()
  and current_usuario_rol() in ('admin', 'suscriptor')
  and can_access_expediente(expediente_id)
);
