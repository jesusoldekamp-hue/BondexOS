import { z } from "zod";
import {
  AI_JOB_ESTADOS,
  AI_JOB_TYPES,
  ANALISIS_TIPOS,
  BROKER_GUARD_FUENTES,
  CEDULA_ESTADOS,
  DECISIONES_SUSCRIPCION,
  DOCUMENTO_ESTADOS,
  EXPEDIENTE_ESTADOS,
  PF_RUTAS_CAPACIDAD,
  RECOMENDACIONES,
  TIPO_ORIGINADOR,
  TIPO_SOLICITANTE,
  TIPOS_FIANZA,
  USUARIO_ROLES
} from "./enums.js";

export const UsuarioRolSchema = z.enum(USUARIO_ROLES);
export const TipoOriginadorSchema = z.enum(TIPO_ORIGINADOR);
export const CedulaEstadoSchema = z.enum(CEDULA_ESTADOS);
export const ExpedienteEstadoSchema = z.enum(EXPEDIENTE_ESTADOS);
export const TipoSolicitanteSchema = z.enum(TIPO_SOLICITANTE);
export const PfRutaCapacidadSchema = z.enum(PF_RUTAS_CAPACIDAD);
export const TipoFianzaSchema = z.enum(TIPOS_FIANZA);
export const DocumentoEstadoSchema = z.enum(DOCUMENTO_ESTADOS);
export const AnalisisTipoSchema = z.enum(ANALISIS_TIPOS);
export const RecomendacionSchema = z.enum(RECOMENDACIONES);
export const DecisionSuscripcionSchema = z.enum(DECISIONES_SUSCRIPCION);
export const BrokerGuardFuenteSchema = z.enum(BROKER_GUARD_FUENTES);
export const AiJobTypeSchema = z.enum(AI_JOB_TYPES);
export const AiJobEstadoSchema = z.enum(AI_JOB_ESTADOS);

const UuidSchema = z.string().uuid();
const DateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const InvitationRequestSchema = z.object({
  email: z.string().email(),
  nombre: z.string().trim().min(2).max(160),
  rol: UsuarioRolSchema
});

export const AuthenticatedUserSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  authUserId: z.string().uuid().nullable(),
  email: z.string().email(),
  nombre: z.string(),
  rol: UsuarioRolSchema,
  activo: z.boolean()
});

export const TenantSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string(),
  plan: z.string(),
  config: z.record(z.unknown()).default({})
});

export const OriginadorCreateRequestSchema = z
  .object({
    usuarioId: UuidSchema,
    tipoOriginador: TipoOriginadorSchema,
    cedulaNum: z.string().trim().min(3).max(80).optional(),
    cedulaEstado: CedulaEstadoSchema.optional(),
    cedulaVence: DateStringSchema.optional(),
    tipoAgente: z.string().trim().min(2).max(120).optional()
  })
  .superRefine((value, ctx) => {
    if (value.tipoOriginador !== "broker_cedulado") {
      return;
    }

    if (!value.cedulaNum) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cedulaNum"],
        message: "La cedula es obligatoria para broker cedulado."
      });
    }
  });

export const BrokerGuardVerificationSchema = z.object({
  originadorId: UuidSchema.optional(),
  cedulaNum: z.string().trim().min(1),
  estado: CedulaEstadoSchema,
  fuente: BrokerGuardFuenteSchema,
  verificadoEn: z.string().datetime(),
  vence: DateStringSchema.nullable(),
  detalle: z.string().max(600).optional(),
  bloqueaOperacion: z.boolean(),
  requiereRevision: z.boolean()
});

export const ExpedienteCreateRequestSchema = z
  .object({
    originadorId: UuidSchema,
    clienteUsuarioId: UuidSchema.optional(),
    clienteRfc: z.string().trim().min(10).max(13).transform((value) => value.toUpperCase()),
    tipoSolicitante: TipoSolicitanteSchema,
    pfRutaCapacidad: PfRutaCapacidadSchema.optional(),
    pfEstadoCivil: z.string().trim().min(2).max(80).optional(),
    tipoFianza: TipoFianzaSchema,
    montoSolicitado: z.coerce.number().positive().max(999_999_999_999)
  })
  .superRefine((value, ctx) => {
    if (value.tipoSolicitante === "PF" && !value.pfRutaCapacidad) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pfRutaCapacidad"],
        message: "La ruta C1/C2 es obligatoria para persona fisica."
      });
    }

    if (value.tipoSolicitante === "PM" && value.pfRutaCapacidad) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pfRutaCapacidad"],
        message: "La ruta PF no aplica para persona moral."
      });
    }
  });

export const DocumentoUploadUrlRequestSchema = z.object({
  filename: z.string().trim().min(5).max(180),
  contentType: z.literal("application/pdf"),
  sizeBytes: z.coerce.number().int().positive().max(25 * 1024 * 1024)
});

export const DocumentoStatusUpdateRequestSchema = z
  .object({
    estado: DocumentoEstadoSchema,
    urlR2: z.string().url().optional(),
    r2Key: z.string().trim().min(3).max(500).optional(),
    sizeBytes: z.coerce.number().int().positive().max(25 * 1024 * 1024).optional(),
    datosExtraidosJson: z.record(z.unknown()).optional(),
    fuenteValidacion: z.string().trim().min(2).max(120).optional(),
    rechazadoMotivo: z.string().trim().min(3).max(600).optional()
  })
  .superRefine((value, ctx) => {
    if (value.estado === "rechazado" && !value.rechazadoMotivo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rechazadoMotivo"],
        message: "El motivo es obligatorio al rechazar un documento."
      });
    }
  });

export const AiJobRequestSchema = z
  .object({
    expedienteId: UuidSchema,
    documentoId: UuidSchema.optional(),
    tipo: AiJobTypeSchema
  })
  .superRefine((value, ctx) => {
    if (
      (value.tipo === "clasificar_documento" ||
        value.tipo === "extraer_datos" ||
        value.tipo === "validar_coherencia") &&
      !value.documentoId
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["documentoId"],
        message: "Este job de IA requiere documentoId."
      });
    }
  });

export const DocumentoClasificacionOutputSchema = z.object({
  tipoDocumento: z.string().min(1),
  confianza: z.number().min(0).max(1),
  camposDetectados: z.array(z.string()).default([]),
  requiereRevision: z.boolean()
});

export const DocumentoExtraccionOutputSchema = z.object({
  campos: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
  confianza: z.number().min(0).max(1),
  inconsistencias: z.array(z.string()).default([]),
  requiereRevision: z.boolean()
});

export const ValidacionCoherenciaOutputSchema = z.object({
  valido: z.boolean(),
  hallazgos: z.array(z.string()).default([]),
  requiereRevision: z.boolean()
});

export const AnalisisFinancieroOutputSchema = z.object({
  tipoAnalisis: AnalisisTipoSchema,
  ratios: z.record(z.number()),
  score: z.number().int().min(0).max(1000).nullable(),
  recomendacion: RecomendacionSchema.nullable(),
  supuestos: z.array(z.string()).default([]),
  alertas: z.array(z.string()).default([]),
  requiereRevision: z.boolean()
});

export const MemoSuscripcionOutputSchema = z.object({
  resumen: z.string().min(20),
  fortalezas: z.array(z.string()).default([]),
  riesgos: z.array(z.string()).default([]),
  recomendacion: z.string().min(3),
  condicionesSugeridas: z.array(z.string()).default([]),
  requiereRevision: z.boolean()
});

export const ScoringRequestSchema = z.object({
  expedienteId: z.string().uuid()
});

export const DecisionRequestSchema = z
  .object({
    decision: DecisionSuscripcionSchema,
    condiciones: z.string().trim().min(3).max(2000).optional(),
    motivoRechazo: z.string().trim().min(3).max(2000).optional(),
    montoAprobado: z.coerce.number().positive().max(999_999_999_999).optional()
  })
  .superRefine((value, ctx) => {
    if (value.decision === "aprobado_con_condiciones" && !value.condiciones) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["condiciones"],
        message: "Las condiciones son obligatorias para aprobacion condicionada."
      });
    }

    if (value.decision === "rechazado" && !value.motivoRechazo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["motivoRechazo"],
        message: "El motivo es obligatorio al rechazar."
      });
    }

    if (value.decision === "pendiente" && !value.motivoRechazo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["motivoRechazo"],
        message: "El motivo es obligatorio al marcar como pendiente."
      });
    }
  });

export type InvitationRequest = z.infer<typeof InvitationRequestSchema>;
export type AuthenticatedUser = z.infer<typeof AuthenticatedUserSchema>;
export type Tenant = z.infer<typeof TenantSchema>;
export type OriginadorCreateRequest = z.infer<typeof OriginadorCreateRequestSchema>;
export type BrokerGuardVerification = z.infer<typeof BrokerGuardVerificationSchema>;
export type ExpedienteCreateRequest = z.infer<typeof ExpedienteCreateRequestSchema>;
export type DocumentoUploadUrlRequest = z.infer<typeof DocumentoUploadUrlRequestSchema>;
export type DocumentoStatusUpdateRequest = z.infer<typeof DocumentoStatusUpdateRequestSchema>;
export type AiJobRequest = z.infer<typeof AiJobRequestSchema>;
export type DocumentoClasificacionOutput = z.infer<typeof DocumentoClasificacionOutputSchema>;
export type DocumentoExtraccionOutput = z.infer<typeof DocumentoExtraccionOutputSchema>;
export type ValidacionCoherenciaOutput = z.infer<typeof ValidacionCoherenciaOutputSchema>;
export type AnalisisFinancieroOutput = z.infer<typeof AnalisisFinancieroOutputSchema>;
export type MemoSuscripcionOutput = z.infer<typeof MemoSuscripcionOutputSchema>;
export type ScoringRequest = z.infer<typeof ScoringRequestSchema>;
export type DecisionRequest = z.infer<typeof DecisionRequestSchema>;

