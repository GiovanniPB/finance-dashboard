import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";

import { useAuth } from "./AuthProvider";
import { canViewModule, type DataModule } from "./modules";

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

interface ProfilePermissions {
  role: UserRole;
  /** null = todos os módulos (sem restrição); array = allow-list. */
  visibleModules: DataModule[] | null;
}

/**
 * Loads the current user's role and visible modules from `profiles`.
 * Returns helpers:
 *  - isSuperAdmin: bypasses all company scoping
 *  - canManage: admin-level operations within accessible companies
 *  - canEdit: editor or higher within accessible companies
 *  - canView(module): whether the user may see a given data module
 */
export function usePermissions() {
  const { user } = useAuth();

  const query = useQuery<ProfilePermissions>({
    queryKey: ["profile-permissions", user?.id ?? "none"],
    queryFn: async () => {
      if (!user?.id) return { role: "viewer", visibleModules: null };
      const { data, error } = await supabase
        .from("profiles")
        .select("role, visible_modules")
        .eq("id", user.id)
        .maybeSingle();
      if (error) throw error;
      return {
        role: (data?.role as UserRole | null) ?? "viewer",
        visibleModules: (data?.visible_modules as DataModule[] | null) ?? null,
      };
    },
    enabled: Boolean(user?.id),
    staleTime: 5 * 60_000,
  });

  const role = query.data?.role ?? null;
  const visibleModules = query.data?.visibleModules ?? null;
  const isSuperAdmin = role === "super_admin";

  const canView = (module: DataModule) => canViewModule(isSuperAdmin, visibleModules, module);

  return {
    role,
    visibleModules,
    isLoading: query.isLoading,
    isSuperAdmin,
    canEdit: isSuperAdmin || role === "admin" || role === "editor",
    canManage: isSuperAdmin || role === "admin",
    canView,
  };
}
