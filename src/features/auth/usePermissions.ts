import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";

import { useAuth } from "./AuthProvider";

export type UserRole = "admin" | "editor" | "viewer";

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrador",
  editor: "Lançador",
  viewer: "Visualizador",
};

export function roleLabel(role: UserRole | undefined): string {
  return role ? ROLE_LABELS[role] : "—";
}

/**
 * Loads the current user's role from `profiles`.
 * Returns helpers `canEdit` (admin or editor) and `canManage` (admin only).
 */
export function usePermissions() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["profile-role", user?.id ?? "none"],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data?.role ?? "admin";
    },
    enabled: Boolean(user?.id),
    staleTime: 5 * 60_000,
  });

  const role = query.data ?? null;
  return {
    role,
    isLoading: query.isLoading,
    canEdit: role === "admin" || role === "editor",
    canManage: role === "admin",
  };
}
