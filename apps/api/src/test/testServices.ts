import {
  buildChecklistForExpediente,
  hasCompleteRequiredDocuments,
  type BrokerGuardVerification
} from "@bondexos/shared";
import { brokerGuardBlocksOperation } from "@bondexos/integrations";
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
  SignedUploadContext,
  TenantContext,
  UpdateDocumentoInput,
  UsuarioContext
} from "../services/types.js";

export interface TestServicesState {
  tokens: Map<string, AuthUser>;
  usersByAuthId: Map<string, UsuarioContext>;
  tenants: Map<string, TenantContext>;
  audits: AuditRecordInput[];
  invitedUsers: UsuarioContext[];
  originadores: Map<string, OriginadorContext>;
  expedientes: Map<string, ExpedienteContext>;
  documentos: Map<string, DocumentoContext[]>;
  aiJobs: Map<string, AiJobContext>;
  uploads: SignedUploadContext[];
}

function serviceError(statusCode: number, code: string, message: string): Error {
  const error = new Error(message) as Error & { statusCode: number; code: string };
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function nextId(_prefix: string, count: number): string {
  const suffix = String(count + 1).padStart(12, "0");
  return `00000000-0000-4000-8000-${suffix}`;
}

function recalculateProgress(state: TestServicesState, expedienteId: string): void {
  const expediente = state.expedientes.get(expedienteId);
  const documentos = state.documentos.get(expedienteId) ?? [];
  if (!expediente) {
    return;
  }

  const required = documentos.filter((documento) => documento.obligatorio);
  const valid = required.filter((documento) => documento.estado === "validado");
  const progresoObligatorio = required.length === 0 ? 100 : Math.round((valid.length / required.length) * 100);

  state.expedientes.set(expedienteId, {
    ...expediente,
    progresoObligatorio,
    estado: progresoObligatorio === 100 ? "completo" : "en_proceso"
  });
}

function getVerification(originador: OriginadorContext): BrokerGuardVerification {
  if (originador.tipoOriginador === "vendedor_interno" || !originador.cedulaNum) {
    return {
      originadorId: originador.id,
      cedulaNum: originador.cedulaNum ?? "vendedor-interno",
      estado: "vigente",
      fuente: "fallback",
      verificadoEn: new Date().toISOString(),
      vence: null,
      detalle: "Vendedor interno no requiere cedula.",
      bloqueaOperacion: false,
      requiereRevision: false
    };
  }

  const normalized = originador.cedulaNum.toUpperCase();
  const estado = normalized.includes("SUSP")
    ? "suspendida"
    : normalized.includes("CANC")
      ? "cancelada"
      : normalized.includes("NR")
        ? "no_registrada"
        : "vigente";
  const vence = normalized.includes("VENC") ? "2026-01-01" : "2027-05-05";

  return {
    originadorId: originador.id,
    cedulaNum: normalized,
    estado,
    fuente: normalized.includes("ERR") ? "fallback" : "sandbox",
    verificadoEn: new Date().toISOString(),
    vence: normalized.includes("ERR") ? null : vence,
    detalle: normalized.includes("ERR")
      ? "Falla tecnica simulada; no bloquea."
      : "Verificacion sandbox.",
    bloqueaOperacion: normalized.includes("ERR") ? false : brokerGuardBlocksOperation(estado, vence),
    requiereRevision: normalized.includes("ERR")
  };
}

export function createTestServices(state: TestServicesState): AppServices {
  return {
    async validateToken(accessToken: string) {
      return state.tokens.get(accessToken) ?? null;
    },

    async getUsuarioByAuthUserId(authUserId: string) {
      return state.usersByAuthId.get(authUserId) ?? null;
    },

    async getTenantById(tenantId: string) {
      return state.tenants.get(tenantId) ?? null;
    },

    async listUsersByTenant(tenantId: string) {
      return [...state.usersByAuthId.values()].filter((user) => user.tenantId === tenantId);
    },

    async inviteUser(input: InviteUserInput) {
      const user: UsuarioContext = {
        id: `user-${state.invitedUsers.length + 1}`,
        tenantId: input.tenantId,
        authUserId: `auth-invited-${state.invitedUsers.length + 1}`,
        email: input.email,
        nombre: input.nombre,
        rol: input.rol,
        activo: true
      };
      state.invitedUsers.push(user);
      return user;
    },

    async listOriginadoresByTenant(tenantId: string) {
      return [...state.originadores.values()].filter((originador) => originador.tenantId === tenantId);
    },

    async getOriginadorById(tenantId: string, originadorId: string) {
      const originador = state.originadores.get(originadorId);
      return originador?.tenantId === tenantId ? originador : null;
    },

    async createOriginador(input: CreateOriginadorInput) {
      const id = nextId("orig", state.originadores.size);
      const originador: OriginadorContext = {
        id,
        tenantId: input.tenantId,
        usuarioId: input.usuarioId,
        tipoOriginador: input.tipoOriginador,
        cedulaNum: input.cedulaNum ?? null,
        cedulaEstado:
          input.tipoOriginador === "broker_cedulado"
            ? input.cedulaEstado ?? "verificacion_pendiente"
            : null,
        cedulaVence: input.cedulaVence ?? null,
        cedulaVerificadoEn: null,
        cedulaFuente: null,
        cedulaDetalle: null,
        tipoAgente: input.tipoAgente ?? null
      };
      state.originadores.set(id, originador);
      if (originador.tipoOriginador === "broker_cedulado") {
        await this.verifyOriginador(input.tenantId, id);
        return state.originadores.get(id) ?? originador;
      }

      return originador;
    },

    async verifyOriginador(tenantId: string, originadorId: string) {
      const originador = state.originadores.get(originadorId);
      if (!originador || originador.tenantId !== tenantId) {
        throw serviceError(404, "originador_not_found", "Originador no encontrado.");
      }

      const verification = getVerification(originador);
      state.originadores.set(originadorId, {
        ...originador,
        cedulaEstado: verification.estado,
        cedulaVence: verification.vence,
        cedulaVerificadoEn: verification.verificadoEn,
        cedulaFuente: verification.fuente,
        cedulaDetalle: verification.detalle ?? null
      });
      return verification;
    },

    async listExpedientesByTenant(tenantId: string, usuario: UsuarioContext) {
      const expedientes = [...state.expedientes.values()].filter(
        (expediente) => expediente.tenantId === tenantId
      );
      if (["admin", "suscriptor", "auditor"].includes(usuario.rol)) {
        return expedientes;
      }

      const ownOriginadores = new Set(
        [...state.originadores.values()]
          .filter((originador) => originador.tenantId === tenantId && originador.usuarioId === usuario.id)
          .map((originador) => originador.id)
      );
      return expedientes.filter(
        (expediente) =>
          ownOriginadores.has(expediente.originadorId) || expediente.clienteUsuarioId === usuario.id
      );
    },

    async getExpedienteDetail(tenantId: string, expedienteId: string): Promise<ExpedienteDetail | null> {
      const expediente = state.expedientes.get(expedienteId);
      if (!expediente || expediente.tenantId !== tenantId) {
        return null;
      }

      return {
        expediente,
        documentos: state.documentos.get(expedienteId) ?? [],
        aiJobs: [...state.aiJobs.values()].filter((job) => job.expedienteId === expedienteId)
      };
    },

    async createExpediente(input: CreateExpedienteInput) {
      const originador = state.originadores.get(input.originadorId);
      if (!originador || originador.tenantId !== input.tenantId) {
        throw serviceError(404, "originador_not_found", "Originador no encontrado.");
      }

      if (
        originador.tipoOriginador === "broker_cedulado" &&
        brokerGuardBlocksOperation(originador.cedulaEstado, originador.cedulaVence)
      ) {
        throw serviceError(409, "brokerguard_blocked", "BrokerGuard bloqueo la creacion.");
      }

      const id = nextId("expe", state.expedientes.size);
      const expediente: ExpedienteContext = {
        id,
        tenantId: input.tenantId,
        originadorId: input.originadorId,
        clienteUsuarioId: input.clienteUsuarioId ?? null,
        clienteRfc: input.clienteRfc,
        tipoSolicitante: input.tipoSolicitante,
        pfRutaCapacidad: input.pfRutaCapacidad ?? null,
        pfEstadoCivil: input.pfEstadoCivil ?? null,
        tipoFianza: input.tipoFianza,
        estado: "en_proceso",
        score: null,
        montoSolicitado: input.montoSolicitado,
        montoAprobado: null,
        progresoObligatorio: 0,
        submittedAt: null,
        aiEstado: "pendiente",
        createdAt: new Date().toISOString()
      };
      state.expedientes.set(id, expediente);

      const documentos = buildChecklistForExpediente({
        tipoSolicitante: input.tipoSolicitante,
        pfRutaCapacidad: input.pfRutaCapacidad ?? null,
        pfEstadoCivil: input.pfEstadoCivil ?? null,
        tenantConfig: input.tenantConfig
      }).map((documento, index): DocumentoContext => ({
        id: nextId("docu", state.documentos.size + index),
        tenantId: input.tenantId,
        expedienteId: id,
        tipo: documento.tipo,
        nombre: documento.nombre,
        obligatorio: documento.obligatorio,
        condicion: documento.condicion ?? null,
        checklistVersion: documento.checklistVersion,
        orden: documento.orden,
        estado: documento.estado,
        urlR2: null,
        r2Key: null,
        contentType: null,
        sizeBytes: null,
        datosExtraidosJson: {},
        validadoEn: null,
        cargadoEn: null,
        fuenteValidacion: null,
        rechazadoMotivo: null
      }));
      state.documentos.set(id, documentos);

      return {
        expediente,
        documentos,
        aiJobs: []
      };
    },

    async createDocumentUploadUrl(input: CreateDocumentUploadUrlInput) {
      const upload: SignedUploadContext = {
        key: `tenants/${input.tenantId}/expedientes/${input.expedienteId}/${input.documentoId}.pdf`,
        url: `https://r2.sandbox.bondexos.local/${input.documentoId}.pdf`,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
      };
      state.uploads.push(upload);
      return upload;
    },

    async updateDocumento(input: UpdateDocumentoInput) {
      const documentos = state.documentos.get(input.expedienteId) ?? [];
      const documento = documentos.find((item) => item.id === input.documentoId);
      if (!documento || documento.tenantId !== input.tenantId) {
        throw serviceError(404, "documento_not_found", "Documento no encontrado.");
      }

      const updated: DocumentoContext = {
        ...documento,
        estado: input.estado,
        urlR2: input.urlR2 ?? documento.urlR2,
        r2Key: input.r2Key ?? documento.r2Key,
        sizeBytes: input.sizeBytes ?? documento.sizeBytes,
        contentType: input.estado === "cargado" ? "application/pdf" : documento.contentType,
        datosExtraidosJson: input.datosExtraidosJson ?? documento.datosExtraidosJson,
        validadoEn: input.estado === "validado" ? new Date().toISOString() : documento.validadoEn,
        cargadoEn: input.estado === "cargado" ? new Date().toISOString() : documento.cargadoEn,
        fuenteValidacion: input.fuenteValidacion ?? documento.fuenteValidacion,
        rechazadoMotivo: input.rechazadoMotivo ?? documento.rechazadoMotivo
      };
      state.documentos.set(
        input.expedienteId,
        documentos.map((item) => (item.id === input.documentoId ? updated : item))
      );
      recalculateProgress(state, input.expedienteId);
      return updated;
    },

    async submitExpediente(tenantId: string, expedienteId: string) {
      const detail = await this.getExpedienteDetail(tenantId, expedienteId);
      if (!detail) {
        throw serviceError(404, "expediente_not_found", "Expediente no encontrado.");
      }

      if (!hasCompleteRequiredDocuments(detail.documentos)) {
        throw serviceError(409, "documentos_obligatorios_incompletos", "Documentos incompletos.");
      }

      const updated: ExpedienteContext = {
        ...detail.expediente,
        estado: "en_suscripcion",
        submittedAt: new Date().toISOString(),
        progresoObligatorio: 100
      };
      state.expedientes.set(expedienteId, updated);

      return {
        ...detail,
        expediente: updated
      };
    },

    async enqueueAiJob(input: EnqueueAiJobInput) {
      const detail = await this.getExpedienteDetail(input.tenantId, input.expedienteId);
      if (!detail) {
        throw serviceError(404, "expediente_not_found", "Expediente no encontrado.");
      }

      const id = nextId("aijb", state.aiJobs.size);
      const job: AiJobContext = {
        id,
        tenantId: input.tenantId,
        expedienteId: input.expedienteId,
        documentoId: input.documentoId ?? null,
        tipo: input.tipo,
        estado: "pendiente",
        attempts: 0,
        maxAttempts: 3,
        payloadJson: {
          tipo: input.tipo,
          expedienteId: input.expedienteId,
          documentoId: input.documentoId ?? null
        },
        outputJson: {},
        errorMessage: null,
        queuedAt: new Date().toISOString(),
        startedAt: null,
        finishedAt: null,
        createdBy: input.createdBy,
        createdAt: new Date().toISOString()
      };
      state.aiJobs.set(id, job);
      return job;
    },

    async listAiJobsByExpediente(tenantId: string, expedienteId: string) {
      return [...state.aiJobs.values()].filter(
        (job) => job.tenantId === tenantId && job.expedienteId === expedienteId
      );
    },

    async recordAudit(input: AuditRecordInput) {
      state.audits.push(input);
    }
  };
}
