import { createBrowserClient } from "@supabase/ssr";
import { getPublicSupabaseKey, getPublicSupabaseUrl } from "../env";

export function createClient() {
  return createBrowserClient(getPublicSupabaseUrl(), getPublicSupabaseKey());
}
