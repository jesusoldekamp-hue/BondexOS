import type { DocumentStorageAdapter, IntegrationHealth, IntegrationMode, SignedDocumentUrl } from "./base.js";

export interface DocumentStorageAdapterOptions {
  mode?: IntegrationMode;
  bucket?: string;
  publicBaseUrl?: string;
  expiresInSeconds?: number;
}

function sanitizePathPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildDocumentKey(params: {
  tenantId: string;
  expedienteId: string;
  documentoId: string;
  filename: string;
}): string {
  return [
    "tenants",
    params.tenantId,
    "expedientes",
    params.expedienteId,
    "documentos",
    `${params.documentoId}-${sanitizePathPart(params.filename)}`
  ].join("/");
}

export function createDocumentStorageAdapter(
  options: DocumentStorageAdapterOptions = {}
): DocumentStorageAdapter {
  const mode = options.mode ?? "sandbox";
  const expiresInSeconds = options.expiresInSeconds ?? 60 * 60;

  return {
    provider: "Cloudflare R2",
    mode,

    async health(): Promise<IntegrationHealth> {
      const ok = mode === "sandbox" || (!!options.bucket && !!options.publicBaseUrl);
      return {
        provider: "Cloudflare R2",
        mode,
        ok,
        checkedAt: new Date().toISOString(),
        detail: ok
          ? "Storage listo para emitir URLs de carga."
          : "Faltan CLOUDFLARE_R2_BUCKET o CLOUDFLARE_R2_PUBLIC_BASE_URL."
      };
    },

    async createUploadUrl(params): Promise<SignedDocumentUrl> {
      const key = buildDocumentKey(params);
      const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

      if (mode === "real" && options.publicBaseUrl) {
        return {
          key,
          expiresAt,
          url: `${options.publicBaseUrl.replace(/\/$/, "")}/${encodeURI(key)}?upload=presigned&expires=${encodeURIComponent(
            expiresAt
          )}`
        };
      }

      return {
        key,
        expiresAt,
        url: `https://r2.sandbox.bondexos.local/${encodeURI(key)}?contentType=${encodeURIComponent(
          params.contentType
        )}&expires=${encodeURIComponent(expiresAt)}`
      };
    }
  };
}
