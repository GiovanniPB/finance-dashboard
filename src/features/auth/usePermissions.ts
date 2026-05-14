import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";

import { useAuth } from "./AuthProvider";

export type UserRole = "super_admin" | "admin" | "editor" | "viewer";

const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  admin: "Administrador",
  editor: "Lançador",
  viewer: "Visualizador",
};

export function roleLabel(role: UserRole | undefined): string {
  return role ? ROLE_LABELS[role] : "—";
}

/**
 * Loads the current user's role from `profiles`.
 * Returns helpers:
 *  - isSuperAdmin: bypasses all company scoping
 *  - canManage: admin-level operations within accessible companies
 *  - canEdit: editor or higher within accessible companies
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
      return (data?.role as UserRole | null) ?? "viewer";
    },
    enabled: Boolean(user?.id),
    staleTime: 5 * 60_000,
  });

  const role = query.data ?? null;
  const isSuperAdmin = role === "super_admin";
  return {
    role,
    isLoading: query.isLoading,
    isSuperAdmin,
    canEdit: isSuperAdmin || role === "admin" || role === "editor",
    canManage: isSuperAdmin || role === "admin",
  };
}
