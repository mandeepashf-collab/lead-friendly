"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { ImpersonationBanner } from "@/components/agency/ImpersonationBanner";
import { BrandPreviewBanner } from "@/components/branding/BrandPreviewBanner";
import { BillingBanner } from "@/components/billing/BillingBanner";
import { PlatformShortcutListener } from "@/components/platform/PlatformShortcutListener";
import { useSidebarStore } from "@/store/sidebar";
import { useBrand } from "@/contexts/BrandContext";
import { cn } from "@/lib/utils";
import { SoftphoneProvider } from "@/components/softphone/SoftphoneContext";
import { Softphone } from "@/components/softphone/Softphone";
import { TcpaOverrideProvider } from "@/components/tcpa/TcpaOverrideProvider";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isCollapsed } = useSidebarStore();
  const brand = useBrand();
  const showTopBanner = brand.isImpersonating || brand.isBrandPreview;

  return (
    <TcpaOverrideProvider>
      <SoftphoneProvider>
        <div className={cn("min-h-screen bg-zinc-950 text-zinc-100", showTopBanner && "pt-10")}>
          <ImpersonationBanner />
          <BrandPreviewBanner />
          <BillingBanner />
          <PlatformShortcutListener />
          <Sidebar />
          <Header />
          <main
            className={cn(
              "min-h-[calc(100vh-4rem)] transition-all min-w-0 overflow-x-hidden",
              isCollapsed ? "ml-16" : "ml-64"
            )}
          >
            <div className="p-6 min-w-0 max-w-full">{children}</div>
          </main>
          <Softphone />
        </div>
      </SoftphoneProvider>
    </TcpaOverrideProvider>
  );
}
