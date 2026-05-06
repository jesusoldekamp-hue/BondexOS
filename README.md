# BondexOS MVP — Plan Completo de los 8 Módulos

## Resumen
Construir BondexOS como SaaS enterprise piloto end-to-end para 1-2 afianzadoras, con monorepo `apps/web` Next.js 14 + `apps/api` Express, Supabase Auth/Postgres/RLS, BullMQ, Upstash Redis, Cloudflare R2 y adapters sandbox/reales para integraciones externas. El concepto operativo será `originador`: puede ser broker cedulado o vendedor interno; BrokerGuard solo bloquea cuando el originador requiere cédula.

Fuentes técnicas consultadas: [Next.js create-next-app](https://nextjs.org/docs/14/app/api-reference/create-next-app), [Supabase SSR Auth](https://supabase.com/docs/guides/auth/server-side/nextjs), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Supabase Auth getUser](https://supabase.com/docs/reference/javascript/auth-getuser), [Supabase inviteUserByEmail](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail).

## Arquitectura Base
- `apps/web`: App Router, TypeScript estricto, Tailwind, Supabase SSR, TanStack Query, React Hook Form, PDF.js.
- `apps/api`: Express TS, Zod, middleware `requireAuth`, `requireTenant`, `requireRole`, repositories con filtro obligatorio `tenant_id`.
- `apps/workers`: BullMQ para IA, validaciones, alertas, emisión y monitoreo.
- `packages/shared`: enums, tipos, schemas Zod, checklist definitions, scoring rules.
- `packages/integrations`: adapters para SAT, RENAPO, CNSF, AMSFAC, DGP-SEP, PAC, Anthropic, R2 y email.
- Seguridad: RLS en todas las tablas tenant-owned, service role solo en servidor confiable, URLs R2 firmadas máximo 1 hora, auditoría inmutable.
- Deployment: web en Vercel, API/workers en Railway, Supabase migrations, Upstash Redis, R2 por tenant/prefix.

## Modelo e Interfaces Públicas
- Modelo base: `tenant`, `usuario`, `originador`, `expediente`, `documento`, `analisis_financiero`, `decision_suscripcion`, `poliza`, `log_auditoria`.
- `originador` reemplaza conceptualmente a `broker`: `tipo_originador = 'broker_cedulado' | 'vendedor_interno'`, con campos de cédula nullable.
- Enums clave: roles `admin | suscriptor | broker | vendedor | cliente | auditor`; estados de cédula incluyen `verificacion_pendiente`.
- `expediente` incluye `tipo_solicitante PM/PF`, `pf_ruta_capacidad C1/C2`, `pf_estado_civil`, `tipo_fianza` y estado de workflow.
- Checklist dinámico versionado en código y materializado como `documento` al crear expediente; overrides simples por `tenant.config`.
- Todos los endpoints quedan bajo `/api/v1`, devuelven errores JSON normalizados y escriben `log_auditoria` en mutaciones.

## Roadmap por Módulo
1. **Setup + Auth + DB**
   - Scaffold monorepo, migraciones completas, RLS, auth por invitación cerrada, `.env.example`, endpoints `/health`, `/auth/me`, `/admin/invitations`.
   - Gate: typecheck, endpoint protegido, usuario inactivo bloqueado, RLS impide leer otro tenant.

2. **BrokerGuard**
   - Adapter CNSF/AMSFAC con Redis TTL 24h, timeout 3s, 3 reintentos, fallback `verificacion_pendiente`.
   - Jobs 2AM reverifican cédulas activas; alertas 90/60/30 días; bloqueo total para suspendida/cancelada/vencida.
   - Gate: broker bloqueado no crea expediente; vendedor interno puede operar sin cédula; falla técnica no bloquea.

3. **Expediente Digital**
   - Crear expediente PM/PF, ruta PF C1/C2, checklist obligatorio/condicional, carga PDF vía R2 presigned upload.
   - Estados `pendiente/cargado/validado/rechazado`; avance = documentos obligatorios válidos / obligatorios.
   - Gate: no se envía a suscripción sin 100% obligatorio validado.

4. **Motor IA**
   - Anthropic adapter con `ANTHROPIC_MODEL=claude-sonnet-4-6`, prompts en español, outputs JSON validados con Zod.
   - Jobs: clasificar documento, extraer datos, validar coherencia, analizar estados financieros, analizar patrimonial PF, generar memo.
   - Gate: outputs inválidos quedan en revisión; errores se registran y se reintentan sin perder expediente.

5. **Scoring Financiero**
   - Motor determinístico para ratios PM/C2: liquidez 25%, solvencia 25%, rentabilidad 20%, historial 20%, sector 10%.
   - Motor PF C1: patrimonio neto 35%, flujo bancario 30%, liquidez de activos 20%, historial 15%.
   - Recomendación: `700-1000 sin_garantia`, `450-699 obligado_solidario`, `<450 garantia_inmobiliaria`.
   - Gate: fixtures calculan score reproducible y auditable.

6. **Dashboard Suscriptor**
   - Cola de expedientes, vista 4 paneles: resumen, documentos, análisis financiero/patrimonial, memo IA.
   - Decisiones: aprobado, aprobado con condiciones, pendiente, rechazado; suscriptor no emite directamente.
   - Gate: cada decisión exige motivo/condiciones cuando aplica y genera auditoría.

7. **Emisión + PDF + CFDI**
   - Emisión automática por job tras aprobación válida; número de póliza por configuración tenant.
   - Generar póliza PDF, guardar en R2, timbrar CFDI vía PAC adapter sandbox/real, registrar `poliza`.
   - Idempotencia por expediente para evitar pólizas duplicadas.
   - Gate: no emite si BrokerGuard bloquea, documentos incompletos, decisión inválida o PAC falla.

8. **Monitoreo Continuo**
   - Jobs diarios: cédulas, pólizas por vencer, alertas, reporte semanal, limpieza de caché.
   - Notificaciones por email y registro auditable; retries con backoff y DLQ para fallas persistentes.
   - Gate: cambio de cédula a suspendida bloquea nuevas solicitudes existentes y futuras.

## Test Plan
- Antes de iniciar cada módulo: correr build/typecheck/tests del módulo anterior.
- Unit tests: schemas, middleware tenant/roles, scoring, checklist rules, adapters sandbox.
- Integration tests: RLS, auth, expediente completo, upload R2 mock, BullMQ job flow.
- E2E mínimo: admin invita originador, originador crea expediente, carga documentos, IA/scoring procesa, suscriptor aprueba, emisión genera póliza sandbox.
- Seguridad: pruebas negativas por tenant, rol, usuario inactivo, service role no expuesto, URL firmada expirada.

## Supuestos Cerrados
- MVP completo = enterprise piloto, no demo superficial ni hardening extremo de producción.
- Integraciones externas se implementan con adapters sandbox + interfaz real intercambiable por variables de entorno.
- Multi-tenant estricto y auditoría inmutable existen desde Módulo 1.
- Persona Física se soporta desde el modelo inicial, aunque su UI avanzada se activa en Expediente/IA/Scoring.
- Comentarios de código en español; credenciales solo por env; ningún `catch` vacío.
