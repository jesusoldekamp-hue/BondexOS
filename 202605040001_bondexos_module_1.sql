create extension if not exists pgcrypto;

create type usuario_rol as enum (
  'admin',
  'suscriptor',
  'broker',
  'vendedor',
  'cliente',
  'auditor'
);

create type tipo_originador as enum (
  'broker_cedulado',
  'vendedor_interno'
);

create type cedula_estado as enum (
  'vigente',
  'suspendida',
  'cancelada',
  'no_registrada',
  'verificacion_pendiente'
);

create type expediente_estado as enum (
  'borrador',
  'en_proceso',
  'completo',
  'en_suscripcion',
  'aprobado',
  'rechazado',
  'emitido'
);

create type tipo_solicitante as enum ('PM', 'PF');
create type pf_ruta_capacidad as enum ('C1', 'C2');

create type tipo_fianza as enum (
  'administrativa',
  'fidelidad',
  'judicial',
  'credito',
  'fiscal',
  'arrendamiento'
);

create type documento_estado as enum (
  'pendiente',
  'cargado',
  'validado',
  'rechazado'
);

create type analisis_tipo as enum (
  'ratios',
  'patrimonial'
);

create type recomendacion_linea as enum (
  'sin_garantia',
  'obligado_solidario',
  'garantia_inmobiliaria'
);

create type decision_suscripcion_tipo as enum (
  'aprobado',
  'aprobado_con_condiciones',
  'pendiente',
  'rechazado'
);

create table tenant (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  config jsonb not null default '{}'::jsonb,
  plan text not null default 'piloto',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table usuario (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id) on delete restrict,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  rol usuario_rol not null,
  email text not null,
  nombre text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id)
);

create unique index usuario_tenant_email_unique on usuario (tenant_id, lower(email));
create index usuario_tenant_id_idx on usuario (tenant_id);
create index usuario_auth_user_id_idx on usuario (auth_user_id);
create index usuario_rol_idx on usuario (rol);
create index usuario_created_at_idx on usuario (created_at);

create table originador (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id) on delete restrict,
  usuario_id uuid not null,
  tipo_originador tipo_originador not null,
  cedula_num text,
  cedula_estado cedula_estado,
  cedula_vence date,
  tipo_agente text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  constraint originador_usuario_tenant_fk
    foreign key (usuario_id, tenant_id)
    references usuario(id, tenant_id)
    on delete restrict,
  constraint originador_broker_cedula_required
    check (
      tipo_originador = 'vendedor_interno'
      or (cedula_num is not null and cedula_estado is not null)
    )
);

create index originador_tenant_id_idx on originador (tenant_id);
create index originador_usuario_id_idx on originador (usuario_id);
create index originador_estado_idx on originador (cedula_estado);
create index originador_created_at_idx on originador (created_at);

create table expediente (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id) on delete restrict,
  originador_id uuid not null,
  cliente_usuario_id uuid,
  cliente_rfc text not null,
  tipo_solicitante tipo_solicitante not null,
  pf_ruta_capacidad pf_ruta_capacidad,
  pf_estado_civil text,
  tipo_fianza tipo_fianza not null,
  estado expediente_estado not null default 'borrador',
  score integer check (score is null or (score >= 0 and score <= 1000)),
  monto_solicitado numeric(16, 2) not null check (monto_solicitado >= 0),
  monto_aprobado numeric(16, 2) check (monto_aprobado is null or monto_aprobado >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  constraint expediente_originador_tenant_fk
    foreign key (originador_id, tenant_id)
    references originador(id, tenant_id)
    on delete restrict,
  constraint expediente_cliente_tenant_fk
    foreign key (cliente_usuario_id, tenant_id)
    references usuario(id, tenant_id)
    on delete set null,
  constraint expediente_pf_fields_check
    check (
      (tipo_solicitante = 'PF')
      or (pf_ruta_capacidad is null and pf_estado_civil is null)
    )
);

create index expediente_tenant_id_idx on expediente (tenant_id);
create index expediente_originador_id_idx on expediente (originador_id);
create index expediente_estado_idx on expediente (estado);
create index expediente_created_at_idx on expediente (created_at);

create table documento (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id) on delete restrict,
  expediente_id uuid not null,
  tipo text not null,
  estado documento_estado not null default 'pendiente',
  url_r2 text,
  datos_extraidos_json jsonb not null default '{}'::jsonb,
  validado_en timestamptz,
  fuente_validacion text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint documento_expediente_tenant_fk
    foreign key (expediente_id, tenant_id)
    references expediente(id, tenant_id)
    on delete cascade
);

create index documento_tenant_id_idx on documento (tenant_id);
create index documento_expediente_id_idx on documento (expediente_id);
create index documento_estado_idx on documento (estado);
create index documento_created_at_idx on documento (created_at);

create table analisis_financiero (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id) on delete restrict,
  expediente_id uuid not null,
  ratios_json jsonb not null default '{}'::jsonb,
  score integer check (score is null or (score >= 0 and score <= 1000)),
  recomendacion recomendacion_linea,
  memo_texto text,
  generado_por_ia boolean not null default false,
  tipo_analisis analisis_tipo not null default 'ratios',
  patrimonio_bruto numeric(16, 2),
  patrimonio_neto numeric(16, 2),
  flujo_promedio_mensual numeric(16, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint analisis_expediente_tenant_fk
    foreign key (expediente_id, tenant_id)
    references expediente(id, tenant_id)
    on delete cascade
);

create index analisis_financiero_tenant_id_idx on analisis_financiero (tenant_id);
create index analisis_financiero_expediente_id_idx on analisis_financiero (expediente_id);
create index analisis_financiero_created_at_idx on analisis_financiero (created_at);

create table decision_suscripcion (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id) on delete restrict,
  expediente_id uuid not null,
  suscriptor_id uuid not null,
  decision decision_suscripcion_tipo not null,
  condiciones text,
  motivo_rechazo text,
  timestamp timestamptz not null default now(),
  constraint decision_expediente_tenant_fk
    foreign key (expediente_id, tenant_id)
    references expediente(id, tenant_id)
    on delete cascade,
  constraint decision_suscriptor_tenant_fk
    foreign key (suscriptor_id, tenant_id)
    references usuario(id, tenant_id)
    on delete restrict
);

create index decision_suscripcion_tenant_id_idx on decision_suscripcion (tenant_id);
create index decision_suscripcion_expediente_id_idx on decision_suscripcion (expediente_id);
create index decision_suscripcion_timestamp_idx on decision_suscripcion (timestamp);

create table poliza (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id) on delete restrict,
  expediente_id uuid not null,
  numero_poliza text not null,
  monto numeric(16, 2) not null check (monto >= 0),
  prima numeric(16, 2) not null check (prima >= 0),
  fecha_inicio date not null,
  fecha_vencimiento date not null,
  cfdi_uuid text,
  estado text not null default 'borrador',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint poliza_expediente_tenant_fk
    foreign key (expediente_id, tenant_id)
    references expediente(id, tenant_id)
    on delete restrict,
  unique (tenant_id, numero_poliza),
  unique (expediente_id)
);

create index poliza_tenant_id_idx on poliza (tenant_id);
create index poliza_expediente_id_idx on poliza (expediente_id);
create index poliza_estado_idx on poliza (estado);
create index poliza_created_at_idx on poliza (created_at);

create table log_auditoria (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id) on delete restrict,
  usuario_id uuid references usuario(id) on delete set null,
  entidad text not null,
  entidad_id uuid,
  accion text not null,
  datos_json jsonb not null default '{}'::jsonb,
  timestamp timestamptz not null default now()
);

create index log_auditoria_tenant_id_idx on log_auditoria (tenant_id);
create index log_auditoria_usuario_id_idx on log_auditoria (usuario_id);
create index log_auditoria_entidad_idx on log_auditoria (entidad, entidad_id);
create index log_auditoria_timestamp_idx on log_auditoria (timestamp);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tenant_set_updated_at
before update on tenant
for each row execute function set_updated_at();

create trigger usuario_set_updated_at
before update on usuario
for each row execute function set_updated_at();

create trigger originador_set_updated_at
before update on originador
for each row execute function set_updated_at();

create trigger expediente_set_updated_at
before update on expediente
for each row execute function set_updated_at();

create trigger documento_set_updated_at
before update on documento
for each row execute function set_updated_at();

create trigger analisis_financiero_set_updated_at
before update on analisis_financiero
for each row execute function set_updated_at();

create trigger poliza_set_updated_at
before update on poliza
for each row execute function set_updated_at();

create or replace function prevent_log_auditoria_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'log_auditoria es inmutable: no permite update/delete';
end;
$$;

create trigger log_auditoria_insert_only
before update or delete on log_auditoria
for each row execute function prevent_log_auditoria_mutation();

create or replace function current_usuario_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.id
  from usuario u
  where u.auth_user_id = auth.uid()
    and u.activo = true
  limit 1
$$;

create or replace function current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.tenant_id
  from usuario u
  where u.auth_user_id = auth.uid()
    and u.activo = true
  limit 1
$$;

create or replace function current_usuario_rol()
returns usuario_rol
language sql
stable
security definer
set search_path = public
as $$
  select u.rol
  from usuario u
  where u.auth_user_id = auth.uid()
    and u.activo = true
  limit 1
$$;

create or replace function can_access_expediente(target_expediente_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from expediente e
    left join originador o
      on o.id = e.originador_id
      and o.tenant_id = e.tenant_id
    where e.id = target_expediente_id
      and e.tenant_id = current_tenant_id()
      and (
        current_usuario_rol() in ('admin', 'suscriptor', 'auditor')
        or o.usuario_id = current_usuario_id()
        or e.cliente_usuario_id = current_usuario_id()
      )
  )
$$;

alter table tenant enable row level security;
alter table usuario enable row level security;
alter table originador enable row level security;
alter table expediente enable row level security;
alter table documento enable row level security;
alter table analisis_financiero enable row level security;
alter table decision_suscripcion enable row level security;
alter table poliza enable row level security;
alter table log_auditoria enable row level security;

alter table tenant force row level security;
alter table usuario force row level security;
alter table originador force row level security;
alter table expediente force row level security;
alter table documento force row level security;
alter table analisis_financiero force row level security;
alter table decision_suscripcion force row level security;
alter table poliza force row level security;
alter table log_auditoria force row level security;

create policy tenant_select_self
on tenant for select
to authenticated
using (id = current_tenant_id());

create policy tenant_update_admin
on tenant for update
to authenticated
using (id = current_tenant_id() and current_usuario_rol() = 'admin')
with check (id = current_tenant_id() and current_usuario_rol() = 'admin');

create policy usuario_select_tenant
on usuario for select
to authenticated
using (
  tenant_id = current_tenant_id()
  and (
    current_usuario_rol() in ('admin', 'suscriptor', 'auditor')
    or id = current_usuario_id()
  )
);

create policy usuario_insert_admin
on usuario for insert
to authenticated
with check (tenant_id = current_tenant_id() and current_usuario_rol() = 'admin');

create policy usuario_update_admin
on usuario for update
to authenticated
using (tenant_id = current_tenant_id() and current_usuario_rol() = 'admin')
with check (tenant_id = current_tenant_id() and current_usuario_rol() = 'admin');

create policy originador_select_tenant
on originador for select
to authenticated
using (
  tenant_id = current_tenant_id()
  and (
    current_usuario_rol() in ('admin', 'suscriptor', 'auditor')
    or usuario_id = current_usuario_id()
  )
);

create policy originador_insert_admin
on originador for insert
to authenticated
with check (tenant_id = current_tenant_id() and current_usuario_rol() = 'admin');

create policy originador_update_admin
on originador for update
to authenticated
using (tenant_id = current_tenant_id() and current_usuario_rol() = 'admin')
with check (tenant_id = current_tenant_id() and current_usuario_rol() = 'admin');

create policy expediente_select_access
on expediente for select
to authenticated
using (can_access_expediente(id));

create policy expediente_insert_access
on expediente for insert
to authenticated
with check (
  tenant_id = current_tenant_id()
  and (
    current_usuario_rol() in ('admin', 'suscriptor')
    or exists (
      select 1
      from originador o
      where o.id = originador_id
        and o.tenant_id = tenant_id
        and o.usuario_id = current_usuario_id()
    )
  )
);

create policy expediente_update_access
on expediente for update
to authenticated
using (
  tenant_id = current_tenant_id()
  and (
    current_usuario_rol() in ('admin', 'suscriptor')
    or exists (
      select 1
      from originador o
      where o.id = originador_id
        and o.tenant_id = tenant_id
        and o.usuario_id = current_usuario_id()
        and estado in ('borrador', 'en_proceso')
    )
  )
)
with check (tenant_id = current_tenant_id());

create policy documento_select_access
on documento for select
to authenticated
using (tenant_id = current_tenant_id() and can_access_expediente(expediente_id));

create policy documento_insert_access
on documento for insert
to authenticated
with check (
  tenant_id = current_tenant_id()
  and can_access_expediente(expediente_id)
  and current_usuario_rol() <> 'auditor'
);

create policy documento_update_access
on documento for update
to authenticated
using (
  tenant_id = current_tenant_id()
  and can_access_expediente(expediente_id)
  and current_usuario_rol() <> 'auditor'
)
with check (
  tenant_id = current_tenant_id()
  and can_access_expediente(expediente_id)
  and current_usuario_rol() <> 'auditor'
);

create policy analisis_financiero_select_access
on analisis_financiero for select
to authenticated
using (tenant_id = current_tenant_id() and can_access_expediente(expediente_id));

create policy analisis_financiero_insert_suscriptor
on analisis_financiero for insert
to authenticated
with check (
  tenant_id = current_tenant_id()
  and current_usuario_rol() in ('admin', 'suscriptor')
  and can_access_expediente(expediente_id)
);

create policy analisis_financiero_update_suscriptor
on analisis_financiero for update
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

create policy decision_suscripcion_select_access
on decision_suscripcion for select
to authenticated
using (tenant_id = current_tenant_id() and can_access_expediente(expediente_id));

create policy decision_suscripcion_insert_suscriptor
on decision_suscripcion for insert
to authenticated
with check (
  tenant_id = current_tenant_id()
  and current_usuario_rol() in ('admin', 'suscriptor')
  and suscriptor_id = current_usuario_id()
  and can_access_expediente(expediente_id)
);

create policy poliza_select_access
on poliza for select
to authenticated
using (tenant_id = current_tenant_id() and can_access_expediente(expediente_id));

create policy poliza_insert_admin_suscriptor
on poliza for insert
to authenticated
with check (
  tenant_id = current_tenant_id()
  and current_usuario_rol() in ('admin', 'suscriptor')
  and can_access_expediente(expediente_id)
);

create policy poliza_update_admin_suscriptor
on poliza for update
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

create policy log_auditoria_select_admin_auditor
on log_auditoria for select
to authenticated
using (
  tenant_id = current_tenant_id()
  and current_usuario_rol() in ('admin', 'auditor')
);

create policy log_auditoria_insert_same_tenant
on log_auditoria for insert
to authenticated
with check (
  tenant_id = current_tenant_id()
  and usuario_id = current_usuario_id()
);
