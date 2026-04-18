"use client";

import { useState, useRef, useEffect } from "react";
import { User, Settings, HelpCircle, LogOut, ChevronDown, CreditCard, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface Props { initials?: string; name?: string; email?: string }

export function UserMenu({ initials = "MS", name = "Mandeep", email = "" }: Props) {
  const [open, setOpen] = useState(false);
  const ref             = useRef<HTMLDivElement>(null);
  const router          = useRouter();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  const items: { icon: React.ElementType; label: string; href?: string; external?: string }[] = [
    { icon: User,       label: "My Profile",       href: "/settings?tab=organization" },
    { icon: Settings,   label: "Account Settings", href: "/settings?tab=organization" },
    { icon: CreditCard, label: "Billing",           href: "/billing" },
    { icon: Users,      label: "Team",             href: "/settings?tab=team" },
    { icon: HelpCircle, label: "Help & Support",   external: "https://docs.leadfriendly.com" },
  ];

  const handleItem = (item: typeof items[number]) => {
    setOpen(false);
    if (item.external) {
      window.open(item.external, "_blank", "noopener noreferrer");
    } else if (item.href) {
      router.push(item.href);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 rounded-lg p-1 hover:bg-zinc-800 transition-colors"
        aria-label="User menu"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white">
          {initials}
        </div>
        <ChevronDown className={`h-3 w-3 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-56 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl">
          {/* User info */}
          <div className="border-b border-zinc-800 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white">
                {initials}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">{name}</p>
                {email && <p className="truncate text-xs text-zinc-500">{email}</p>}
                <span className="text-xs font-medium text-indigo-400">Pro Plan</span>
              </div>
            </div>
          </div>

          {/* Menu items */}
          <div className="py-1">
            {items.map(item => (
              <button
                key={item.label}
                onClick={() => handleItem(item)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-zinc-400 hover:bg-zinc-900 hover:text-white transition-colors"
              >
                <item.icon className="h-4 w-4 shrink-0 text-zinc-600" />
                {item.label}
              </button>
            ))}
          </div>

          {/* Sign out */}
          <div className="border-t border-zinc-800 py-1">
            <button
              onClick={signOut}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-red-950/30 hover:text-red-300 transition-colors"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
