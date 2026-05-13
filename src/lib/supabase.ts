import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Faltam variáveis de ambiente VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY. " +
      "Copie .env.example para .env e preencha.",
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
