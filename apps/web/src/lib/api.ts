import { getServerApiUrl } from "./env";

export interface ApiResult<T> {
  data: T | null;
  error: string | null;
}

function getErrorMessage(body: unknown): string {
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "object" &&
    body.error !== null &&
    "message" in body.error &&
    typeof body.error.message === "string"
  ) {
    return body.error.message;
  }

  return "Error de API.";
}

export async function apiGet<T>(path: string, accessToken: string): Promise<ApiResult<T>> {
  try {
    const response = await fetch(`${getServerApiUrl()}${path}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      cache: "no-store"
    });

    const body = (await response.json()) as unknown;
    if (!response.ok) {
      return { data: null, error: getErrorMessage(body) };
    }

    return { data: body as T, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo conectar con la API.";
    return { data: null, error: message };
  }
}
