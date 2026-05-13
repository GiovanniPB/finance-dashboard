import * as React from "react";
import { Outlet } from "react-router-dom";
import { Menu } from "lucide-react";

import { Sheet, SheetContent } from "@/components/ui/sheet";
import { CommandPalette } from "@/features/command/CommandPalette";

import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppShell() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = React.useState(false);

  return (
    <CommandPalette>
      <div className="flex min-h-screen bg-bg">
        {/* Desktop sidebar */}
        <div className="sticky top-0 hidden h-screen lg:flex">
          <Sidebar />
        </div>

        {/* Mobile sidebar via Sheet */}
        <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
          <SheetContent side="left" size="sm" className="p-0">
            <Sidebar onNavigate={() => setMobileSidebarOpen(false)} />
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            mobileMenuTrigger={
              <button
                aria-label="Menu"
                onClick={() => setMobileSidebarOpen(true)}
                className="grid h-9 w-9 place-items-center rounded-[var(--radius-md)] text-text-muted transition-colors hover:bg-surface-2 hover:text-text lg:hidden"
              >
                <Menu className="size-5" />
              </button>
            }
          />
          <main className="flex-1 overflow-x-hidden">
            <Outlet />
          </main>
        </div>
      </div>
    </CommandPalette>
  );
}
