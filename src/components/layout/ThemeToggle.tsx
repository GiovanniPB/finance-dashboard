import { Monitor, Moon, Sun } from "lucide-react";

import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ThemeToggle() {
  const { theme, setTheme, resolved } = useTheme();
  const Icon = resolved === "dark" ? Moon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Alterar tema">
          <Icon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => setTheme("light")}>
          <Sun className="size-4" /> Claro{" "}
          {theme === "light" && <span className="text-2xs ml-auto text-accent">●</span>}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme("dark")}>
          <Moon className="size-4" /> Escuro{" "}
          {theme === "dark" && <span className="text-2xs ml-auto text-accent">●</span>}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme("system")}>
          <Monitor className="size-4" /> Sistema{" "}
          {theme === "system" && <span className="text-2xs ml-auto text-accent">●</span>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
