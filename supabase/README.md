# Supabase

## Migraciones

`202605040001_bondexos_module_1.sql` crea el modelo base de BondexOS, habilita RLS en todas las tablas de negocio y hace `log_auditoria` inmutable.

`202605050001_bondexos_modules_2_3_4.sql` agrega BrokerGuard, checklist/documentos con progreso obligatorio y jobs IA con estados auditables.

## Smoke checks recomendados

Despues de aplicar la migracion en un proyecto Supabase:

1. Verificar que todas las tablas de negocio tengan RLS habilitado.
2. Confirmar que un usuario de tenant A no pueda leer tenant B.
3. Confirmar que un auditor pueda leer logs, pero no mutar tablas.
4. Ejecutar `update log_auditoria ...` y `delete from log_auditoria ...` para confirmar que el trigger bloquea la mutacion.
