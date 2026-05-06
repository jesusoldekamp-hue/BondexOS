export type IntegrationMode = "sandbox" | "real";

export interface IntegrationHealth {
  provider: string;
  mode: IntegrationMode;
  ok: boolean;
  checkedAt: string;
  detail?: string;
}

export interface ExternalAdapter {
  readonly provider: string;
  readonly mode: IntegrationMode;
  health(): Promise<IntegrationHealth>;
}

export interface SignedDocumentUrl {
  url: string;
  key: string;
  expiresAt: string;
}

export interface DocumentStorageAdapter extends ExternalAdapter {
  createUploadUrl(params: {
    tenantId: string;
    expedienteId: string;
    documentoId: string;
    filename: string;
    contentType: "application/pdf";
  }): Promise<SignedDocumentUrl>;
}

export interface AiAnalysisAdapter extends ExternalAdapter {
  model: string;
}
