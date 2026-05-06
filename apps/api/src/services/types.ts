import type {
  AiJobEstado,
  AiJobRequest,
  AiJobType,
  BrokerGuardVerification,
  CedulaEstado,
  DocumentoEstado,
  DocumentoStatusUpdateRequest,
  DocumentoUploadUrlRequest,
  ExpedienteCreateRequest,
  ExpedienteEstado,
  InvitationRequest,
  PfRutaCapacidad,
  TipoFianza,
  TipoOriginador,
  TipoSolicitante,
  UsuarioRol
} from "@bondexos/shared";

export interface AuthUser {
  id: string;
  email: string | null;
}

export interface UsuarioContext {
  id: string;
  tenantId: string;
  authUserId: string | null;
  email: string;
  nombre: string;
  rol: UsuarioRol;
  activo: boolean;
}

export interface TenantContext {
  id: string;
  nombre: string;
  plan: string;
  config: Record<string, unknown>;
}

export interface AuditRecordInput {
  tenantId: string;
  usuarioId: string | null;
  entidad: string;
  entidadId: string | null;
  accion: string;
  datos: Record<string, unknown>;
}

export interface InviteUserInput extends InvitationRequest {
  tenantId: string;
  invitedByUsuarioId: string;
  redirectTo: string;
}

export interface OriginadorContext {
  id: string;
  tenantId: string;
  usuarioId: string;
  tipoOriginador: TipoOriginador;
  cedulaNum: string | null;
  cedulaEstado: CedulaEstado | null;
  cedulaVence: string | null;
  cedulaVerificadoEn: string | null;
  cedulaFuente: string | null;
  cedulaDetalle: string | null;
  tipoAgente: string | null;
}

export interface CreateOriginadorInput {
  tenantId: string;
  usuarioId: string;
  tipoOriginador: TipoOriginador;
  cedulaNum?: string;
  cedulaEstado?: CedulaEstado;
  cedulaVence?: string;
  tipoAgente?: string;
}

export interface ExpedienteContext {
  id: string;
  tenantId: string;
  originadorId: string;
  clienteUsuarioId: string | null;
  clienteRfc: string;
  tipoSolicitante: TipoSolicitante;
  pfRutaCapacidad: PfRutaCapacidad | null;
  pfEstadoCivil: string | null;
  tipoFianza: TipoFianza;
  estado: ExpedienteEstado;
  score: number | null;
  montoSolicitado: number;
  montoAprobado: number | null;
  progresoObligatorio: number;
  submittedAt: string | null;
  aiEstado: AiJobEstado;
  createdAt: string;
}

export interface DocumentoContext {
  id: string;
  tenantId: string;
  expedienteId: string;
  tipo: string;
  nombre: string;
  obligatorio: boolean;
  condicion: string | null;
  checklistVersion: string;
  orden: number;
  estado: DocumentoEstado;
  urlR2: string | null;
  r2Key: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  datosExtraidosJson: Record<string, unknown>;
  validadoEn: string | null;
  cargadoEn: string | null;
  fuenteValidacion: string | null;
  rechazadoMotivo: string | null;
}

export interface ExpedienteDetail {
  expediente: ExpedienteContext;
  documentos: DocumentoContext[];
  aiJobs: AiJobContext[];
}

export interface SignedUploadContext {
  url: string;
  key: string;
  expiresAt: string;
}

export interface CreateDocumentUploadUrlInput extends DocumentoUploadUrlRequest {
  tenantId: string;
  expedienteId: string;
  documentoId: string;
}

export interface UpdateDocumentoInput extends DocumentoStatusUpdateRequest {
  tenantId: string;
  expedienteId: string;
  documentoId: string;
}

export interface CreateExpedienteInput extends ExpedienteCreateRequest {
  tenantId: string;
  tenantConfig: Record<string, unknown>;
}

export interface AiJobContext {
  id: string;
  tenantId: string;
  expedienteId: string;
  documentoId: string | null;
  tipo: AiJobType;
  estado: AiJobEstado;
  attempts: number;
  maxAttempts: number;
  payloadJson: Record<string, unknown>;
  outputJson: Record<string, unknown>;
  errorMessage: string | null;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface EnqueueAiJobInput extends AiJobRequest {
  tenantId: string;
  createdBy: string;
}

export interface AppServices {
  validateToken(accessToken: string): Promise<AuthUser | null>;
  getUsuarioByAuthUserId(authUserId: string): Promise<UsuarioContext | null>;
  getTenantById(tenantId: string): Promise<TenantContext | null>;
  listUsersByTenant(tenantId: string): Promise<UsuarioContext[]>;
  inviteUser(input: InviteUserInput): Promise<UsuarioContext>;
  listOriginadoresByTenant(tenantId: string): Promise<OriginadorContext[]>;
  getOriginadorById(tenantId: string, originadorId: string): Promise<OriginadorContext | null>;
  createOriginador(input: CreateOriginadorInput): Promise<OriginadorContext>;
  verifyOriginador(tenantId: string, originadorId: string): Promise<BrokerGuardVerification>;
  listExpedientesByTenant(tenantId: string, usuario: UsuarioContext): Promise<ExpedienteContext[]>;
  getExpedienteDetail(tenantId: string, expedienteId: string): Promise<ExpedienteDetail | null>;
  createExpediente(input: CreateExpedienteInput): Promise<ExpedienteDetail>;
  createDocumentUploadUrl(input: CreateDocumentUploadUrlInput): Promise<SignedUploadContext>;
  updateDocumento(input: UpdateDocumentoInput): Promise<DocumentoContext>;
  submitExpediente(tenantId: string, expedienteId: string): Promise<ExpedienteDetail>;
  enqueueAiJob(input: EnqueueAiJobInput): Promise<AiJobContext>;
  listAiJobsByExpediente(tenantId: string, expedienteId: string): Promise<AiJobContext[]>;
  recordAudit(input: AuditRecordInput): Promise<void>;
}
