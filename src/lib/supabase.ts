import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

interface RuntimeEnv {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}

declare global {
  interface Window {
    __APP_ENV__?: RuntimeEnv;
  }
}

/**
 * Resolve env vars from Vite (build-time) first, then from window.__APP_ENV__
 * (runtime injection via /public/env.js for hosts where rebuilding only to
 * change envs is inconvenient).
 */
function readEnv(key: keyof RuntimeEnv): string | undefined {
  const fromVite = import.meta.env[key] as string | undefined;
  if (fromVite) return fromVite;
  if (typeof window !== "undefined") {
    return window.__APP_ENV__?.[key];
  }
  return undefined;
}

const supabaseUrl = readEnv("VITE_SUPABASE_URL");
const supabaseAnonKey = readEnv("VITE_SUPABASE_ANON_KEY");

if (!supabaseUrl || !supabaseAnonKey) {
  const missing = [
    !supabaseUrl && "VITE_SUPABASE_URL",
    !supabaseAnonKey && "VITE_SUPABASE_ANON_KEY",
  ]
    .filter(Boolean)
    .join(", ");
  throw new Error(
    `Variáveis de ambiente ausentes: ${missing}. ` +
      "Em Vite, essas variáveis são lidas em build time — se você já configurou " +
      "no host (Cloudflare Pages, Vercel, etc), garanta que estejam no ambiente " +
      "de BUILD (não só runtime) e dispare uma nova deployment. " +
      "Alternativa runtime: defina window.__APP_ENV__ em /public/env.js.",
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "fin-dash-auth",
  },
});

export type Tables = Database["public"]["Tables"];
export type Enums = Database["public"]["Enums"];
