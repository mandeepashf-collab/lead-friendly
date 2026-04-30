import type { Metadata, Viewport } from "next";
import "./globals.css";
import { headers } from "next/headers";
import { WhiteLabelLayout } from "@/components/agency/WhiteLabelLayout";
import { BrandProvider } from "@/contexts/BrandContext";
import { ToastProvider } from "@/lib/toast";
import { getRequestBrand } from "@/lib/branding/get-request-brand";
import { brandToCssText } from "@/lib/branding/css-vars";
import { isMasterBrandRequest, SITE_URL } from "@/lib/seo/master-brand";
import { OrganizationSchema } from "@/components/seo/json-ld";

// ────────────────────────────────────────────────────────────────────────────
// Stage 3.2 — Root layout
// ────────────────────────────────────────────────────────────────────────────
// Load-bearing file. Three coexisting concerns:
//   1. <ToastProvider> (mounted Apr 24 — commit a33a944, required for useToast)
//   2. <BrandProvider> (Stage 3.2 — reads server-injected __LF_BRAND__)
//   3. <WhiteLabelLayout> (legacy agency white-label — reads middleware headers)
// Do NOT remove any of the three.
//
// SEO concerns (added Apr 30):
//   - generateMetadata branches on isMasterBrandRequest():
//       * master (leadfriendly.com / localhost / *.vercel.app) → full SEO
//         metadata, "%s | Lead Friendly" title template, OrganizationSchema.
//       * tenant (any custom_domain) → portalName-driven title, noindex,
//         no OrganizationSchema, no canonical to leadfriendly.com.
//   - getRequestBrand() is React-cache()-wrapped so generateMetadata and
//     the layout body share one resolved brand per request.
// ────────────────────────────────────────────────────────────────────────────

export async function generateMetadata(): Promise<Metadata> {
  const [{ brand }, isMaster] = await Promise.all([
    getRequestBrand(),
    isMasterBrandRequest(),
  ]);

  if (isMaster) {
    return {
      metadataBase: new URL(SITE_URL),
      title: {
        default:
          "Lead Friendly — AI-powered sales calling, built into your CRM",
        template: "%s | Lead Friendly",
      },
      description:
        "AI voice agents, telephony, and CRM in one platform. No Retell. No Twilio. Everything you need to close more deals — included.",
      applicationName: "Lead Friendly",
      authors: [{ name: "Lead Friendly" }],
      generator: "Next.js",
      keywords: [
        "AI sales CRM",
        "AI voice agent",
        "AI cold calling",
        "AI SDR",
        "sales automation",
        "voice AI",
        "CRM with calling",
      ],
      alternates: { canonical: "/" },
      openGraph: {
        type: "website",
        siteName: "Lead Friendly",
        locale: "en_US",
        url: SITE_URL,
        title:
          "Lead Friendly — AI-powered sales calling, built into your CRM",
        description:
          "AI voice agents, telephony, and CRM in one platform. Everything you need to close more deals — included.",
      },
      twitter: {
        card: "summary_large_image",
        title: "Lead Friendly — AI sales calling, built into your CRM",
        description:
          "AI voice agents, telephony, and CRM in one platform. No Retell. No Twilio.",
      },
      robots: {
        index: true,
        follow: true,
        googleBot: {
          index: true,
          follow: true,
          "max-image-preview": "large",
          "max-snippet": -1,
          "max-video-preview": -1,
        },
      },
    };
  }

  // White-label tenant. Their portal, their brand — Lead Friendly stays out
  // of the title, OG, canonical, and the search index entirely.
  return {
    title: {
      default: brand.portalName,
      template: `%s | ${brand.portalName}`,
    },
    description: brand.portalName,
    robots: { index: false, follow: false },
    icons: brand.faviconUrl ? { icon: brand.faviconUrl } : undefined,
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f172a",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Brand + effective org id come from getRequestBrand() (cache()-wrapped, so
  // generateMetadata above and this body share one resolved brand per request).
  // Source priority: impersonation > custom domain > brand preview > default.
  const [{ brand, effectiveOrgId, isBrandPreview }, isMaster] =
    await Promise.all([getRequestBrand(), isMasterBrandRequest()]);

  // The remaining headers below carry per-request session/role state that the
  // hydration script forwards to the client. They are NOT part of brand
  // resolution and stay inline.
  const hdrs = await headers();

  const impersonationActive = hdrs.get("x-lf-impersonation-active") === "1";
  const actingAsOrgId = hdrs.get("x-lf-acting-as-org-id");
  const actingAsOrgName = hdrs.get("x-lf-acting-as-org-name");
  const actorUserId = hdrs.get("x-lf-actor-user-id");
  const actorEmail = hdrs.get("x-lf-actor-email");
  const impersonationExpiresAt = hdrs.get("x-lf-impersonation-expires-at");

  // Stage 3.3.1 — role flags from middleware. Drives sub-account visibility
  // gating (sidebar agency nav, Branding tab, PoweredBy override).
  const userIsAgencyAdmin = hdrs.get("x-lf-user-is-agency-admin") === "1";
  const userIsSubAccount = hdrs.get("x-lf-user-is-sub-account") === "1";

  // Stage 3.5.2 — platform-staff flag from middleware. Drives the Platform
  // header link + the Alt+Shift+P shortcut + the /platform/* layout gate.
  const userIsPlatformStaff = hdrs.get("x-lf-platform-staff") === "1";

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
    `window.__LF_PLATFORM_STAFF__=${JSON.stringify({ isStaff: userIsPlatformStaff })};`,
  ].join("");

  return (
    <html lang="en" className="dark">
      <head>
        {/* Title and favicon are driven by generateMetadata above:
            - master → "Lead Friendly — …" / static src/app/favicon.ico
            - tenant → brand.portalName        / brand.faviconUrl via metadata.icons
            Do NOT re-add a literal <title> or <link rel="icon"> here — that
            would reintroduce the duplicate-tag issue the SEO audit flagged. */}
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
        {isMaster && <OrganizationSchema />}
        <BrandProvider>
          <ToastProvider>
            <WhiteLabelLayout>{children}</WhiteLabelLayout>
          </ToastProvider>
        </BrandProvider>
      </body>
    </html>
  );
}
