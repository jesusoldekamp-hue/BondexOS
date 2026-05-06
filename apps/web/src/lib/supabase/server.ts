import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getPublicSupabaseKey, getPublicSupabaseUrl } from "../env";

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

export function createClient() {
  const cookieStore = cookies();

  return createServerClient(getPublicSupabaseUrl(), getPublicSupabaseKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch (error) {
          if (process.env.NODE_ENV === "development") {
            console.warn("No se pudieron escribir cookies de Supabase en este contexto.", error);
          }
        }
      }
    }
  });
}
