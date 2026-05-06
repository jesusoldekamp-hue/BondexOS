import { z } from "zod";

const ApiEnvSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000")
});

export type ApiEnv = z.infer<typeof ApiEnvSchema>;

let cachedEnv: ApiEnv | null = null;

export function getApiEnv(): ApiEnv {
  if (cachedEnv) {
    return cachedEnv;
  }

  const parsed = ApiEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Variables de entorno invalidas para API: ${details}`);
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}
