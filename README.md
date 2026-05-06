# BondexOS

MVP enterprise para automatizacion de fianzas con IA en Mexico.

## Modulos implementados

Este repositorio implementa la base de BondexOS y los flujos operativos iniciales:

- Monorepo con `apps/web`, `apps/api`, `apps/workers`, `packages/shared` y `packages/integrations`.
- Next.js 14 + TypeScript + Tailwind en frontend.
- Express + TypeScript + Zod en backend.
- Supabase Auth con invitacion cerrada.
- PostgreSQL con RLS multi-tenant y auditoria inmutable.
- Modulo 2 BrokerGuard: verificacion CNSF/AMSFAC sandbox/real, cache TTL, fallback no bloqueante y bloqueo por cedula suspendida/cancelada/no registrada/vencida.
- Modulo 3 Expediente Digital: creacion PM/PF C1/C2, checklist versionado, progreso obligatorio y URLs presigned R2 sandbox/real.
- Modulo 4 Motor IA: jobs auditables, adapter Anthropic con modelo `claude-sonnet-4-6`, salidas JSON validadas y fallback a revision.

## Comandos

```bash
npm install
npm run typecheck
npm run lint
npm run test
npm run build
npm run dev
```

## Configuracion

Crear `.env.local` en `apps/web` o variables de entorno equivalentes, y `.env`/variables del runtime para `apps/api`. La referencia completa esta en `.env.example`.
