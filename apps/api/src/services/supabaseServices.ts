import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { buildChecklistForExpediente, hasCompleteRequiredDocuments } from "@bondexos/shared";
import {
  brokerGuardBlocksOperation,
  createBrokerGuardAdapter,
  createDocumentStorageAdapter
} from "@bondexos/integrations";
import { getApiEnv } from "../config/env.js";
import type {
  AiJobContext,
  AppServices,
  AuditRecordInput,
  AuthUser,
  CreateDocumentUploadUrlInput,
  CreateExpedienteInput,
  CreateOriginadorInput,
  DocumentoContext,
  EnqueueAiJobInput,
  ExpedienteContext,
  ExpedienteDetail,
  InviteUserInput,
  OriginadorContext,
  TenantContext,
  UpdateDocumentoInput,
  UsuarioContext
} from "./types.js";

let supabaseAdmin: SupabaseClient | null = null;

function getSupabaseAdmin(): SupabaseClient {
  if (supabaseAdmin) {
    return supabaseAdmin;
  }

  const env = getApiEnv();
  supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
  return supabaseAdmin;
}

interface UsuarioRow {
  id: string;
  tenant_id: string;
  auth_user_id: string | null;
  email: string;
  nombre: string;
  rol: UsuarioContext["rol"];
  activo: boolean;
}

interface TenantRow {
  id: string;
  nombre: string;
  plan: string;
  config: Record<string, unknown> | null;
}

interface OriginadorRow {
  id: string;
  tenant_id: string;
  usuario_id: string;
  tipo_originador: OriginadorContext["tipoOriginador"];
  cedula_num: string | null;
  cedula_estado: OriginadorContext["cedulaEstado"];
  cedula_vence: string | null;
  cedula_verificado_en: string | null;
  cedula_fuente: string | null;
  cedula_detalle: string | null;
  tipo_agente: string | null;
}

interface ExpedienteRow {
  id: string;
  tenant_id: string;
  originador_id: string;
  cliente_usuario_id: string | null;
  cliente_rfc: string;
  tipo_solicitante: ExpedienteContext["tipoSolicitante"];
  pf_ruta_capacidad: ExpedienteContext["pfRutaCapacidad"];
  pf_estado_civil: string | null;
  tipo_fianza: ExpedienteContext["tipoFianza"];
  estado: ExpedienteContext["estado"];
  score: number | null;
  monto_solicitado: string | number;
  monto_aprobado: string | number | null;
  progreso_obligatorio: number;
  submitted_at: string | null;
  ai_estado: ExpedienteContext["aiEstado"];
  created_at: string;
}

interface DocumentoRow {
  id: string;
  tenant_id: string;
  expediente_id: string;
  tipo: string;
  nombre: string | null;
  obligatorio: boolean;
  condicion: string | null;
  checklist_version: string;
  orden: number;
  estado: DocumentoContext["estado"];
  url_r2: string | null;
  r2_key: string | null;
  content_type: string | null;
  size_bytes: number | null;
  datos_extraidos_json: Record<string, unknown> | null;
  validado_en: string | null;
  cargado_en: string | null;
  fuente_validacion: string | null;
  rechazado_motivo: string | null;
}

interface AiJobRow {
  id: string;
  tenant_id: string;
  expediente_id: string;
  documento_id: string | null;
  tipo: AiJobContext["tipo"];
  estado: AiJobContext["estado"];
  attempts: number;
  max_attempts: number;
  payload_json: Record<string, unknown> | null;
  output_json: Record<string, unknown> | null;
  error_message: string | null;
  queued_at: string;
  started_at: string | null;
  finished_at: string | null;
  created_by: string | null;
  created_at: string;
}

function mapUsuario(row: UsuarioRow): UsuarioContext {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    authUserId: row.auth_user_id,
    email: row.email,
    nombre: row.nombre,
    rol: row.rol,
    activo: row.activo
  };
}

function mapTenant(row: TenantRow): TenantContext {
  return {
    id: row.id,
    nombre: row.nombre,
    plan: row.plan,
    config: row.config ?? {}
  };
}

function mapOriginador(row: OriginadorRow): OriginadorContext {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    usuarioId: row.usuario_id,
    tipoOriginador: row.tipo_originador,
    cedulaNum: row.cedula_num,
    cedulaEstado: row.cedula_estado,
    cedulaVence: row.cedula_vence,
    cedulaVerificadoEn: row.cedula_verificado_en,
    cedulaFuente: row.cedula_fuente,
    cedulaDetalle: row.cedula_detalle,
    tipoAgente: row.tipo_agente
  };
}

function mapExpediente(row: ExpedienteRow): ExpedienteContext {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    originadorId: row.originador_id,
    clienteUsuarioId: row.cliente_usuario_id,
    clienteRfc: row.cliente_rfc,
    tipoSolicitante: row.tipo_solicitante,
    pfRutaCapacidad: row.pf_ruta_capacidad,
    pfEstadoCivil: row.pf_estado_civil,
    tipoFianza: row.tipo_fianza,
    estado: row.estado,
    score: row.score,
    montoSolicitado: Number(row.monto_solicitado),
    montoAprobado: row.monto_aprobado === null ? null : Number(row.monto_aprobado),
    progresoObligatorio: row.progreso_obligatorio,
    submittedAt: row.submitted_at,
    aiEstado: row.ai_estado,
    createdAt: row.created_at
  };
}

function mapDocumento(row: DocumentoRow): DocumentoContext {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    expedienteId: row.expediente_id,
    tipo: row.tipo,
    nombre: row.nombre ?? row.tipo,
    obligatorio: row.obligatorio,
    condicion: row.condicion,
    checklistVersion: row.checklist_version,
    orden: row.orden,
    estado: row.estado,
    urlR2: row.url_r2,
    r2Key: row.r2_key,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    datosExtraidosJson: row.datos_extraidos_json ?? {},
    validadoEn: row.validado_en,
    cargadoEn: row.cargado_en,
    fuenteValidacion: row.fuente_validacion,
    rechazadoMotivo: row.rechazado_motivo
  };
}

function mapAiJob(row: AiJobRow): AiJobContext {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    expedienteId: row.expediente_id,
    documentoId: row.documento_id,
    tipo: row.tipo,
    estado: row.estado,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    payloadJson: row.payload_json ?? {},
    outputJson: row.output_json ?? {},
    errorMessage: row.error_message,
    queuedAt: row.queued_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdBy: row.created_by,
    createdAt: row.created_at
  };
}

function createServiceError(statusCode: number, code: string, message: string): Error {
  const error = new Error(message) as Error & { statusCode: number; code: string };
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

const ORIGINADOR_COLUMNS =
  "id, tenant_id, usuario_id, tipo_originador, cedula_num, cedula_estado, cedula_vence, cedula_verificado_en, cedula_fuente, cedula_detalle, tipo_agente";

const EXPEDIENTE_COLUMNS =
  "id, tenant_id, originador_id, cliente_usuario_id, cliente_rfc, tipo_solicitante, pf_ruta_capacidad, pf_estado_civil, tipo_fianza, estado, score, monto_solicitado, monto_aprobado, progreso_obligatorio, submitted_at, ai_estado, created_at";

const DOCUMENTO_COLUMNS =
  "id, tenant_id, expediente_id, tipo, nombre, obligatorio, condicion, checklist_version, orden, estado, url_r2, r2_key, content_type, size_bytes, datos_extraidos_json, validado_en, cargado_en, fuente_validacion, rechazado_motivo";

const AI_JOB_COLUMNS =
  "id, tenant_id, expediente_id, documento_id, tipo, estado, attempts, max_attempts, payload_json, output_json, error_message, queued_at, started_at, finished_at, created_by, created_at";

function getBrokerGuardAdapter() {
  const mode = process.env.BROKERGUARD_MODE === "real" ? "real" : "sandbox";
  return createBrokerGuardAdapter({
    mode,
    ...(process.env.CNSF_BASE_URL ? { cnsfBaseUrl: process.env.CNSF_BASE_URL } : {}),
    ...(process.env.AMSFAC_BASE_URL ? { amsfacBaseUrl: process.env.AMSFAC_BASE_URL } : {})
  });
}

function getStorageAdapter() {
  const mode = process.env.R2_MODE === "real" ? "real" : "sandbox";
  return createDocumentStorageAdapter({
    mode,
    ...(process.env.CLOUDFLARE_R2_BUCKET ? { bucket: process.env.CLOUDFLARE_R2_BUCKET } : {}),
    ...(process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL
      ? { publicBaseUrl: process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL }
      : {})
  });
}

export function createSupabaseServices(): AppServices {
  const client = getSupabaseAdmin();

  return {
    async validateToken(accessToken: string): Promise<AuthUser | null> {
      const { data, error } = await client.auth.getUser(accessToken);
      if (error || !data.user) {
        return null;
      }

      return {
        id: data.user.id,
        email: data.user.email ?? null
      };
    },

    async getUsuarioByAuthUserId(authUserId: string): Promise<UsuarioContext | null> {
      const { data, error } = await client
        .from("usuario")
        .select("id, tenant_id, auth_user_id, email, nombre, rol, activo")
        .eq("auth_user_id", authUserId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data ? mapUsuario(data as UsuarioRow) : null;
    },

    async getTenantById(tenantId: string): Promise<TenantContext | null> {
      const { data, error } = await client
        .from("tenant")
        .select("id, nombre, plan, config")
        .eq("id", tenantId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data ? mapTenant(data as TenantRow) : null;
    },

    async listUsersByTenant(tenantId: string): Promise<UsuarioContext[]> {
      const { data, error } = await client
        .from("usuario")
        .select("id, tenant_id, auth_user_id, email, nombre, rol, activo")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      return (data as UsuarioRow[] | null)?.map(mapUsuario) ?? [];
    },

    async inviteUser(input: InviteUserInput): Promise<UsuarioContext> {
      const { data, error } = await client.auth.admin.inviteUserByEmail(input.email, {
        data: {
          nombre: input.nombre,
          rol: input.rol,
          tenant_id: input.tenantId
        },
        redirectTo: input.redirectTo
      });

      if (error) {
        throw error;
      }

      if (!data.user) {
        throw new Error("Supabase no regreso usuario invitado.");
      }

      const { data: usuario, error: upsertError } = await client
        .from("usuario")
        .upsert(
          {
            tenant_id: input.tenantId,
            auth_user_id: data.user.id,
            email: input.email.toLowerCase(),
            nombre: input.nombre,
            rol: input.rol,
            activo: true
          },
          {
            onConflict: "auth_user_id"
          }
        )
        .select("id, tenant_id, auth_user_id, email, nombre, rol, activo")
        .single();

      if (upsertError) {
        throw upsertError;
      }

      return mapUsuario(usuario as UsuarioRow);
    },

    async listOriginadoresByTenant(tenantId: string): Promise<OriginadorContext[]> {
      const { data, error } = await client
        .from("originador")
        .select(ORIGINADOR_COLUMNS)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      return (data as OriginadorRow[] | null)?.map(mapOriginador) ?? [];
    },

    async getOriginadorById(tenantId: string, originadorId: string): Promise<OriginadorContext | null> {
      const { data, error } = await client
        .from("originador")
        .select(ORIGINADOR_COLUMNS)
        .eq("tenant_id", tenantId)
        .eq("id", originadorId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data ? mapOriginador(data as OriginadorRow) : null;
    },

    async createOriginador(input: CreateOriginadorInput): Promise<OriginadorContext> {
      const insertPayload: Record<string, unknown> = {
        tenant_id: input.tenantId,
        usuario_id: input.usuarioId,
        tipo_originador: input.tipoOriginador,
        cedula_estado:
          input.tipoOriginador === "broker_cedulado"
            ? input.cedulaEstado ?? "verificacion_pendiente"
            : null
      };

      if (input.cedulaNum) {
        insertPayload.cedula_num = input.cedulaNum.trim().toUpperCase();
      }
      if (input.cedulaVence) {
        insertPayload.cedula_vence = input.cedulaVence;
      }
      if (input.tipoAgente) {
        insertPayload.tipo_agente = input.tipoAgente;
      }

      const { data, error } = await client
        .from("originador")
        .insert(insertPayload)
        .select(ORIGINADOR_COLUMNS)
        .single();

      if (error) {
        throw error;
      }

      const originador = mapOriginador(data as OriginadorRow);
      if (originador.tipoOriginador === "broker_cedulado") {
        await this.verifyOriginador(input.tenantId, originador.id);
        return (await this.getOriginadorById(input.tenantId, originador.id)) ?? originador;
      }

      return originador;
    },

    async verifyOriginador(tenantId: string, originadorId: string) {
      const originador = await this.getOriginadorById(tenantId, originadorId);
      if (!originador) {
        throw createServiceError(404, "originador_not_found", "Originador no encontrado.");
      }

      if (originador.tipoOriginador === "vendedor_interno" || !originador.cedulaNum) {
        return {
          originadorId,
          cedulaNum: originador.cedulaNum ?? "vendedor-interno",
          estado: "vigente" as const,
          fuente: "fallback" as const,
          verificadoEn: new Date().toISOString(),
          vence: null,
          detalle: "Vendedor interno no requiere cedula.",
          bloqueaOperacion: false,
          requiereRevision: false
        };
      }

      const result = await getBrokerGuardAdapter().verify({
        tenantId,
        originadorId,
        cedulaNum: originador.cedulaNum,
        ...(originador.cedulaVence ? { cedulaVence: originador.cedulaVence } : {})
      });

      const { error: updateError } = await client
        .from("originador")
        .update({
          cedula_estado: result.estado,
          cedula_vence: result.vence,
          cedula_verificado_en: result.verificadoEn,
          cedula_fuente: result.fuente,
          cedula_detalle: result.detalle ?? null
        })
        .eq("tenant_id", tenantId)
        .eq("id", originadorId);

      if (updateError) {
        throw updateError;
      }

      const { error: auditError } = await client.from("brokerguard_verificacion").insert({
        tenant_id: tenantId,
        originador_id: originadorId,
        cedula_num: result.cedulaNum,
        estado: result.estado,
        fuente: result.fuente,
        verificado_en: result.verificadoEn,
        vence: result.vence,
        detalle: result.detalle ?? null,
        bloquea_operacion: result.bloqueaOperacion
      });

      if (auditError) {
        throw auditError;
      }

      return result;
    },

    async listExpedientesByTenant(tenantId: string, usuario: UsuarioContext): Promise<ExpedienteContext[]> {
      const { data, error } = await client
        .from("expediente")
        .select(EXPEDIENTE_COLUMNS)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      const expedientes = (data as ExpedienteRow[] | null)?.map(mapExpediente) ?? [];
      if (["admin", "suscriptor", "auditor"].includes(usuario.rol)) {
        return expedientes;
      }

      const originadores = await this.listOriginadoresByTenant(tenantId);
      const ownOriginadorIds = new Set(
        originadores.filter((originador) => originador.usuarioId === usuario.id).map((originador) => originador.id)
      );

      return expedientes.filter(
        (expediente) =>
          ownOriginadorIds.has(expediente.originadorId) || expediente.clienteUsuarioId === usuario.id
      );
    },

    async getExpedienteDetail(tenantId: string, expedienteId: string): Promise<ExpedienteDetail | null> {
      const { data: expedienteData, error: expedienteError } = await client
        .from("expediente")
        .select(EXPEDIENTE_COLUMNS)
        .eq("tenant_id", tenantId)
        .eq("id", expedienteId)
        .maybeSingle();

      if (expedienteError) {
        throw expedienteError;
      }

      if (!expedienteData) {
        return null;
      }

      const [documentosResult, jobsResult] = await Promise.all([
        client
          .from("documento")
          .select(DOCUMENTO_COLUMNS)
          .eq("tenant_id", tenantId)
          .eq("expediente_id", expedienteId)
          .order("orden", { ascending: true }),
        client
          .from("ai_job")
          .select(AI_JOB_COLUMNS)
          .eq("tenant_id", tenantId)
          .eq("expediente_id", expedienteId)
          .order("created_at", { ascending: false })
      ]);

      if (documentosResult.error) {
        throw documentosResult.error;
      }
      if (jobsResult.error) {
        throw jobsResult.error;
      }

      return {
        expediente: mapExpediente(expedienteData as ExpedienteRow),
        documentos: ((documentosResult.data as DocumentoRow[] | null) ?? []).map(mapDocumento),
        aiJobs: ((jobsResult.data as AiJobRow[] | null) ?? []).map(mapAiJob)
      };
    },

    async createExpediente(input: CreateExpedienteInput): Promise<ExpedienteDetail> {
      const originador = await this.getOriginadorById(input.tenantId, input.originadorId);
      if (!originador) {
        throw createServiceError(404, "originador_not_found", "Originador no encontrado.");
      }

      if (
        originador.tipoOriginador === "broker_cedulado" &&
        brokerGuardBlocksOperation(originador.cedulaEstado, originador.cedulaVence)
      ) {
        throw createServiceError(
          409,
          "brokerguard_blocked",
          "BrokerGuard bloqueo la creacion del expediente por cedula suspendida, cancelada, no registrada o vencida."
        );
      }

      const { data: expedienteData, error: expedienteError } = await client
        .from("expediente")
        .insert({
          tenant_id: input.tenantId,
          originador_id: input.originadorId,
          cliente_usuario_id: input.clienteUsuarioId ?? null,
          cliente_rfc: input.clienteRfc,
          tipo_solicitante: input.tipoSolicitante,
          pf_ruta_capacidad: input.pfRutaCapacidad ?? null,
          pf_estado_civil: input.pfEstadoCivil ?? null,
          tipo_fianza: input.tipoFianza,
          estado: "en_proceso",
          monto_solicitado: input.montoSolicitado
        })
        .select(EXPEDIENTE_COLUMNS)
        .single();

      if (expedienteError) {
        throw expedienteError;
      }

      const expediente = mapExpediente(expedienteData as ExpedienteRow);
      const checklist = buildChecklistForExpediente({
        tipoSolicitante: expediente.tipoSolicitante,
        pfRutaCapacidad: expediente.pfRutaCapacidad,
        pfEstadoCivil: expediente.pfEstadoCivil,
        tenantConfig: input.tenantConfig
      });

      const { error: documentosError } = await client.from("documento").insert(
        checklist.map((documento) => ({
          tenant_id: input.tenantId,
          expediente_id: expediente.id,
          tipo: documento.tipo,
          nombre: documento.nombre,
          obligatorio: documento.obligatorio,
          condicion: documento.condicion ?? null,
          checklist_version: documento.checklistVersion,
          orden: documento.orden,
          estado: documento.estado
        }))
      );

      if (documentosError) {
        throw documentosError;
      }

      return (await this.getExpedienteDetail(input.tenantId, expediente.id)) ?? {
        expediente,
        documentos: [],
        aiJobs: []
      };
    },

    async createDocumentUploadUrl(input: CreateDocumentUploadUrlInput) {
      const detail = await this.getExpedienteDetail(input.tenantId, input.expedienteId);
      const documento = detail?.documentos.find((item) => item.id === input.documentoId);
      if (!detail || !documento) {
        throw createServiceError(404, "documento_not_found", "Documento no encontrado.");
      }

      return getStorageAdapter().createUploadUrl({
        tenantId: input.tenantId,
        expedienteId: input.expedienteId,
        documentoId: input.documentoId,
        filename: input.filename,
        contentType: input.contentType
      });
    },

    async updateDocumento(input: UpdateDocumentoInput): Promise<DocumentoContext> {
      const updatePayload: Record<string, unknown> = {
        estado: input.estado
      };

      if (input.estado === "cargado") {
        updatePayload.url_r2 = input.urlR2 ?? null;
        updatePayload.r2_key = input.r2Key ?? null;
        updatePayload.content_type = "application/pdf";
        updatePayload.size_bytes = input.sizeBytes ?? null;
        updatePayload.cargado_en = new Date().toISOString();
      }

      if (input.estado === "validado") {
        updatePayload.validado_en = new Date().toISOString();
        updatePayload.fuente_validacion = input.fuenteValidacion ?? "humana";
      }

      if (input.estado === "rechazado") {
        updatePayload.rechazado_motivo = input.rechazadoMotivo ?? null;
      }

      if (input.datosExtraidosJson) {
        updatePayload.datos_extraidos_json = input.datosExtraidosJson;
      }

      const { data, error } = await client
        .from("documento")
        .update(updatePayload)
        .eq("tenant_id", input.tenantId)
        .eq("expediente_id", input.expedienteId)
        .eq("id", input.documentoId)
        .select(DOCUMENTO_COLUMNS)
        .single();

      if (error) {
        throw error;
      }

      return mapDocumento(data as DocumentoRow);
    },

    async submitExpediente(tenantId: string, expedienteId: string): Promise<ExpedienteDetail> {
      const detail = await this.getExpedienteDetail(tenantId, expedienteId);
      if (!detail) {
        throw createServiceError(404, "expediente_not_found", "Expediente no encontrado.");
      }

      if (!hasCompleteRequiredDocuments(detail.documentos)) {
        throw createServiceError(
          409,
          "documentos_obligatorios_incompletos",
          "No se puede enviar a suscripcion sin 100% de documentos obligatorios validados."
        );
      }

      const { error } = await client
        .from("expediente")
        .update({
          estado: "en_suscripcion",
          submitted_at: new Date().toISOString()
        })
        .eq("tenant_id", tenantId)
        .eq("id", expedienteId);

      if (error) {
        throw error;
      }

      const updated = await this.getExpedienteDetail(tenantId, expedienteId);
      if (!updated) {
        throw createServiceError(404, "expediente_not_found", "Expediente no encontrado.");
      }

      return updated;
    },

    async enqueueAiJob(input: EnqueueAiJobInput): Promise<AiJobContext> {
      const detail = await this.getExpedienteDetail(input.tenantId, input.expedienteId);
      if (!detail) {
        throw createServiceError(404, "expediente_not_found", "Expediente no encontrado.");
      }

      if (input.documentoId && !detail.documentos.some((documento) => documento.id === input.documentoId)) {
        throw createServiceError(404, "documento_not_found", "Documento no encontrado.");
      }

      const { data, error } = await client
        .from("ai_job")
        .insert({
          tenant_id: input.tenantId,
          expediente_id: input.expedienteId,
          documento_id: input.documentoId ?? null,
          tipo: input.tipo,
          estado: "pendiente",
          payload_json: {
            expedienteId: input.expedienteId,
            documentoId: input.documentoId ?? null,
            tipo: input.tipo
          },
          created_by: input.createdBy
        })
        .select(AI_JOB_COLUMNS)
        .single();

      if (error) {
        throw error;
      }

      return mapAiJob(data as AiJobRow);
    },

    async listAiJobsByExpediente(tenantId: string, expedienteId: string): Promise<AiJobContext[]> {
      const { data, error } = await client
        .from("ai_job")
        .select(AI_JOB_COLUMNS)
        .eq("tenant_id", tenantId)
        .eq("expediente_id", expedienteId)
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      return ((data as AiJobRow[] | null) ?? []).map(mapAiJob);
    },

    async recordAudit(input: AuditRecordInput): Promise<void> {
      const { error } = await client.from("log_auditoria").insert({
        tenant_id: input.tenantId,
        usuario_id: input.usuarioId,
        entidad: input.entidad,
        entidad_id: input.entidadId,
        accion: input.accion,
        datos_json: input.datos
      });

      if (error) {
        throw error;
      }
    }
  };
}
