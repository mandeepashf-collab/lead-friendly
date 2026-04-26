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
  // Server-side brand resolution. Three sources, in priority order:
  //   1. Active impersonation session (Stage 3.3) — middleware injects
  //      x-lf-impersonation-active + x-lf-acting-as-org-id when a valid
  //      lf_impersonation_token cookie resolves via get_active_impersonation.
  //      In this case we render the SUB-account's brand, not the agency's.
  //   2. Custom-domain middleware header `x-lf-org-id` — set when a verified
  //      custom domain resolves to an org (Stage 3.2 canonical path).
  //   3. Neither — default DEFAULT_BRAND ships; client BrandProvider then
  //      fetches /api/org/[id]/brand using the session's own org.
  const hdrs = await headers();

  const impersonationActive = hdrs.get("x-lf-impersonation-active") === "1";
  const actingAsOrgId = hdrs.get("x-lf-acting-as-org-id");
  const actingAsOrgName = hdrs.get("x-lf-acting-as-org-name");
  const actorUserId = hdrs.get("x-lf-actor-user-id");
  const actorEmail = hdrs.get("x-lf-actor-email");
  const impersonationExpiresAt = hdrs.get("x-lf-impersonation-expires-at");

  const orgIdFromHost = hdrs.get("x-lf-org-id");

  // Stage 3.3.1 — role flags from middleware. Drives sub-account visibility
  // gating (sidebar agency nav, Branding tab, PoweredBy override).
  const userIsAgencyAdmin = hdrs.get("x-lf-user-is-agency-admin") === "1";
  const userIsSubAccount = hdrs.get("x-lf-user-is-sub-account") === "1";

  // Stage 3.4 — opt-in brand preview header. Set by middleware only when the
  // lf_brand_preview cookie is "1" AND the user is an agency admin AND we're
  // on a platform host. Carries the user's own organization_id.
  const previewOrgId = hdrs.get("x-lf-brand-preview-org-id");

  // Pick brand source. Priority:
  //   impersonation > custom domain > brand preview > platform default.
  // Custom domain wins over preview so visiting a verified custom domain
  // shows that domain's brand even with the preview cookie set.
  const effectiveOrgId = impersonationActive && actingAsOrgId
    ? actingAsOrgId
    : (orgIdFromHost ?? previewOrgId ?? null);

  // True only when the brand was resolved via the preview cookie — not via
  // impersonation or custom-domain. Drives the persistent banner.
  const isBrandPreview =
    !(impersonationActive && actingAsOrgId) &&
    !orgIdFromHost &&
    !!previewOrgId;

  const brand = effectiveOrgId
    ? await loadOrgBrand(effectiveOrgId)
    : DEFAULT_BRAND;

  const cssText = brandToCssText(brand);

  // Inline hydration — client BrandProvider reads __LF_BRAND__ for the brand
  // and __LF_IMPERSONATION__ for the banner + indicator state. No FOUC.
  const impersonationPayload = impersonationActive && actingAsOrgId && actorUserId
    ? {
        subOrganizationId: actingAsOrgId,
        subOrgName: actingAsOrgName,
        actorUserId,
        actorEmail,
        expiresAt: impersonationExpiresAt,
      }
    : null;

  const userOrgPayload = {
    isAgencyAdmin: userIsAgencyAdmin,
    isSubAccount: userIsSubAccount,
  };

  const hydrationScript = [
    `window.__LF_BRAND__=${JSON.stringify(brand)};`,
    effectiveOrgId
      ? `window.__LF_ORG_ID__=${JSON.stringify(effectiveOrgId)};`
      : "",
    impersonationPayload
      ? `window.__LF_IMPERSONATION__=${JSON.stringify(impersonationPayload)};`
      : "",
    `window.__LF_USER_ORG__=${JSON.stringify(userOrgPayload)};`,
    `window.__LF_BRAND_PREVIEW__=${JSON.stringify({ active: isBrandPreview })};`,
  ].join("");

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
