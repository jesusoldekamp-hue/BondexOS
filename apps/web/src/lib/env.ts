export function getPublicSupabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321";
}

export function getPublicSupabaseKey(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "local-placeholder-key";
}

export function getBrowserApiUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
}

export function getServerApiUrl(): string {
  return process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
}
