"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Search, Shield } from "lucide-react";
import { useSidebarStore } from "@/store/sidebar";
import { useBrand } from "@/contexts/BrandContext";
import { cn } from "@/lib/utils";
import { NotificationPanel } from "@/components/layout/notification-panel";
import { UserMenu } from "@/components/layout/user-menu";
import { CommandPalette } from "@/components/layout/command-palette";
import { QuickAdd } from "@/components/layout/quick-add";

export function Header() {
  const { isCollapsed } = useSidebarStore();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const brand = useBrand();

  // ⌘K / Ctrl+K opens command palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-40 flex h-16 items-center justify-between border-b border-zinc-800 bg-zinc-950/80 px-6 backdrop-blur-sm transition-all",
          isCollapsed ? "ml-16" : "ml-64"
        )}
      >
        {/* Search trigger */}
        <div className="flex flex-1 items-center gap-4">
          <button
            onClick={() => setPaletteOpen(true)}
            className="relative flex max-w-md flex-1 items-center"
            aria-label="Open search"
          >
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500 pointer-events-none" />
            <div className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-900 pl-10 pr-4 text-sm text-zinc-600 flex items-center hover:border-zinc-700 transition-colors cursor-pointer">
              Quick search… <span className="ml-auto text-xs text-zinc-700 font-mono">⌘K</span>
            </div>
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {brand.isPlatformStaff && (
            <Link
              href="/platform/orgs"
              title="Platform staff console (Alt+Shift+P)"
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
            >
              <Shield className="h-4 w-4" />
              Platform
            </Link>
          )}
          <QuickAdd />
          <NotificationPanel />
          <UserMenu initials="MS" name="Mandeep" />
        </div>
      </header>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  );
}
