export const USUARIO_ROLES = [
  "admin",
  "suscriptor",
  "broker",
  "vendedor",
  "cliente",
  "auditor"
] as const;

export const TIPO_ORIGINADOR = ["broker_cedulado", "vendedor_interno"] as const;

export const CEDULA_ESTADOS = [
  "vigente",
  "suspendida",
  "cancelada",
  "no_registrada",
  "verificacion_pendiente"
] as const;

export const EXPEDIENTE_ESTADOS = [
  "borrador",
  "en_proceso",
  "completo",
  "en_suscripcion",
  "aprobado",
  "rechazado",
  "emitido"
] as const;

export const TIPO_SOLICITANTE = ["PM", "PF"] as const;

export const PF_RUTAS_CAPACIDAD = ["C1", "C2"] as const;

export const TIPOS_FIANZA = [
  "administrativa",
  "fidelidad",
  "judicial",
  "credito",
  "fiscal",
  "arrendamiento"
] as const;

export const DOCUMENTO_ESTADOS = [
  "pendiente",
  "cargado",
  "validado",
  "rechazado"
] as const;

export const ANALISIS_TIPOS = ["ratios", "patrimonial"] as const;

export const RECOMENDACIONES = [
  "sin_garantia",
  "obligado_solidario",
  "garantia_inmobiliaria"
] as const;

export const DECISIONES_SUSCRIPCION = [
  "aprobado",
  "aprobado_con_condiciones",
  "pendiente",
  "rechazado"
] as const;

export const BROKER_GUARD_FUENTES = [
  "cache",
  "cnsf",
  "amsfac",
  "sandbox",
  "fallback"
] as const;

export const AI_JOB_TYPES = [
  "clasificar_documento",
  "extraer_datos",
  "validar_coherencia",
  "analizar_financiero",
  "analizar_patrimonial",
  "generar_memo"
] as const;

export const AI_JOB_ESTADOS = [
  "pendiente",
  "en_proceso",
  "completado",
  "revision",
  "fallido"
] as const;

export type UsuarioRol = (typeof USUARIO_ROLES)[number];
export type TipoOriginador = (typeof TIPO_ORIGINADOR)[number];
export type CedulaEstado = (typeof CEDULA_ESTADOS)[number];
export type ExpedienteEstado = (typeof EXPEDIENTE_ESTADOS)[number];
export type TipoSolicitante = (typeof TIPO_SOLICITANTE)[number];
export type PfRutaCapacidad = (typeof PF_RUTAS_CAPACIDAD)[number];
export type TipoFianza = (typeof TIPOS_FIANZA)[number];
export type DocumentoEstado = (typeof DOCUMENTO_ESTADOS)[number];
export type AnalisisTipo = (typeof ANALISIS_TIPOS)[number];
export type Recomendacion = (typeof RECOMENDACIONES)[number];
export type DecisionSuscripcion = (typeof DECISIONES_SUSCRIPCION)[number];
export type BrokerGuardFuente = (typeof BROKER_GUARD_FUENTES)[number];
export type AiJobType = (typeof AI_JOB_TYPES)[number];
export type AiJobEstado = (typeof AI_JOB_ESTADOS)[number];
