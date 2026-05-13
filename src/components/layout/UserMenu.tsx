import { LogOut, User as UserIcon } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/features/auth/AuthProvider";
import { roleLabel, usePermissions } from "@/features/auth/usePermissions";

function computeInitials(fullName: string | undefined, email: string | undefined): string {
  if (fullName) {
    return fullName
      .split(" ")
      .filter(Boolean)
      .map((s) => s[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  }
  return email?.[0]?.toUpperCase() ?? "?";
}

export function UserMenu() {
  const { user, signOut } = useAuth();
  const { role } = usePermissions();
  const fullName =
    typeof user?.user_metadata.full_name === "string" ? user.user_metadata.full_name : undefined;
  const initials = computeInitials(fullName, user?.email);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-full transition-opacity hover:opacity-90">
          <Avatar className="h-8 w-8 ring-1 ring-border">
            <AvatarFallback className="bg-accent-soft font-semibold text-accent">
              {initials}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[240px]">
        <DropdownMenuLabel>
          <div className="flex flex-col gap-0.5 tracking-normal normal-case">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-text">{fullName ?? "Usuário"}</span>
              {role && <Badge tone="accent">{roleLabel(role)}</Badge>}
            </div>
            <span className="text-2xs truncate text-text-subtle">{user?.email}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <UserIcon className="size-4" /> Perfil
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            void signOut();
          }}
          className="text-expense"
        >
          <LogOut className="size-4" /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
