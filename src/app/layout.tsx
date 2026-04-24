import type { Metadata } from "next";
import "./globals.css";
import { headers } from "next/headers";
import { WhiteLabelLayout } from "@/components/agency/WhiteLabelLayout";
import { BrandProvider } from "@/contexts/BrandContext";
import { ToastProvider } from "@/lib/toast";
import { loadOrgBrand } from "@/lib/branding/load";
import { brandToCssText } from "@/lib/branding/css-vars";
import { DEFAULT_BRAND } from "@/lib/schemas/stage3";

// ────────────────────────────────────────────────────────────────────────────
// Stage 3.2 — Root layout
// ────────────────────────────────────────────────────────────────────────────
// Load-bearing file. Three coexisting concerns:
//   1. <ToastProvider> (mounted Apr 24 — commit a33a944, required for useToast)
//   2. <BrandProvider> (Stage 3.2 — reads server-injected __LF_BRAND__)
//   3. <WhiteLabelLayout> (legacy agency white-label — reads middleware headers)
// Do NOT remove any of the three.
// ────────────────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: "AI-Powered Sales CRM",
  description:
    "AI-powered voice sales platform with automated outreach and intelligent CRM.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Server-side brand resolution. Two sources:
  //   a) middleware header `x-lf-org-id` → set when a verified custom domain
  //      resolves to an org via middleware (Stage 3.2 canonical path).
  //   b) No header → the default DEFAULT_BRAND ships; client BrandProvider
  //      then fetches /api/org/[id]/brand using the session's org.
  const hdrs = await headers();
  const orgIdFromHost = hdrs.get("x-lf-org-id");

  const brand = orgIdFromHost
    ? await loadOrgBrand(orgIdFromHost)
    : DEFAULT_BRAND;

  const cssText = brandToCssText(brand);
  // Inline hydration — client BrandProvider reads this on mount, no FOUC.
  const hydrationScript = `window.__LF_BRAND__=${JSON.stringify(brand)};${
    orgIdFromHost ? `window.__LF_ORG_ID__=${JSON.stringify(orgIdFromHost)};` : ""
  }`;

  return (
    <html lang="en" className="dark">
      <head>
        {brand.faviconUrl && <link rel="icon" href={brand.faviconUrl} />}
        <title>{brand.portalName}</title>
        <style dangerouslySetInnerHTML={{ __html: cssText }} />
        <script dangerouslySetInnerHTML={{ __html: hydrationScript }} />
      </head>
      <body
        className="min-h-screen bg-zinc-950 font-sans text-zinc-100 antialiased"
        style={{
          background: "var(--lf-bg, #09090b)",
          color: "var(--lf-text, #f4f4f5)",
          fontFamily: "var(--lf-body-font, 'Inter', system-ui, sans-serif)",
        }}
      >
        <BrandProvider>
          <ToastProvider>
            <WhiteLabelLayout>{children}</WhiteLabelLayout>
          </ToastProvider>
        </BrandProvider>
      </body>
    </html>
  );
}
