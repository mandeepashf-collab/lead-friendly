/**
 * Stage 3.2 — Branding runtime shared types
 * ============================================================================
 *
 * Source: Cowork's 16_shared_types.ts (Stage 3.2 section, verbatim).
 * See /docs/stage3/ for the full multi-stage package.
 *
 * All shapes are column-accurate to `organizations` (verified against live
 * Supabase on 2026-04-24). Matches Cowork's OrgBrandSchema 1:1 so the
 * remainder of Stage 3 (3.3 provisioning, 3.4 snapshots, 3.5 billing) can
 * later extend this file with additional types from 16_shared_types.ts.
 * ============================================================================
 */

import { z } from 'zod'

// ────────────────────────────────────────────────────────────────────────────
// OrgBrand — shape returned by GET /api/org/[id]/brand
// ────────────────────────────────────────────────────────────────────────────

export const OrgBrandSchema = z.object({
  portalName: z.string(),
  primaryLogoUrl: z.string().nullable(),
  faviconUrl: z.string().nullable(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  textColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  sidebarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  headingFont: z.string(),
  bodyFont: z.string(),
  supportEmail: z.string().email().nullable(),
  supportPhone: z.string().nullable(),
  footerText: z.string().nullable(),
  customCss: z.string().nullable(),
  hidePlatformBranding: z.boolean(),
  customDomain: z.string().nullable(),
  domainStatus: z.enum(['not_configured', 'dns_pending', 'verified', 'error']),
  // Computed server-side:
  isWhiteLabeled: z.boolean(),
})
export type OrgBrand = z.infer<typeof OrgBrandSchema>

export const DEFAULT_BRAND: OrgBrand = {
  portalName: 'Lead Friendly',
  primaryLogoUrl: null,
  faviconUrl: null,
  primaryColor: '#6366f1',
  secondaryColor: '#8b5cf6',
  accentColor: '#06b6d4',
  backgroundColor: '#0f172a',
  textColor: '#f8fafc',
  sidebarColor: '#1e293b',
  headingFont: 'Inter',
  bodyFont: 'Inter',
  supportEmail: null,
  supportPhone: null,
  footerText: null,
  customCss: null,
  hidePlatformBranding: false,
  customDomain: null,
  domainStatus: 'not_configured',
  isWhiteLabeled: false,
}

// ────────────────────────────────────────────────────────────────────────────
// Write payload — PATCH /api/org/[id]/brand
// ────────────────────────────────────────────────────────────────────────────
// isWhiteLabeled is computed server-side (from portalName + hidePlatformBranding).
// domainStatus is set only by the domain-verification flow; clients never write it.

export const UpdateOrgBrandInputSchema = OrgBrandSchema.partial().omit({
  isWhiteLabeled: true,
  domainStatus: true,
})
export type UpdateOrgBrandInput = z.infer<typeof UpdateOrgBrandInputSchema>

// ────────────────────────────────────────────────────────────────────────────
// Approved font list for the Settings → Branding picker
// ────────────────────────────────────────────────────────────────────────────
// Keep in sync with next.config.ts font optimization config if added later.
// 8 options covers clean/modern/professional without inflating bundle size.

export const APPROVED_FONTS = [
  'Inter',
  'Plus Jakarta Sans',
  'Geist',
  'Figtree',
  'Space Grotesk',
  'DM Sans',
  'Manrope',
  'IBM Plex Sans',
] as const
export type ApprovedFont = (typeof APPROVED_FONTS)[number]

// ────────────────────────────────────────────────────────────────────────────
// DB row → OrgBrand mapper
// ────────────────────────────────────────────────────────────────────────────
// The only place snake_case ↔ camelCase lives. Every other module imports
// this to avoid drift.

export interface OrganizationBrandingRow {
  portal_name: string | null
  primary_logo_url: string | null
  favicon_url: string | null
  primary_color: string | null
  secondary_color: string | null
  accent_color: string | null
  background_color: string | null
  text_color: string | null
  sidebar_color: string | null
  heading_font: string | null
  body_font: string | null
  support_email: string | null
  support_phone: string | null
  footer_text: string | null
  custom_css: string | null
  hide_platform_branding: boolean | null
  custom_domain: string | null
  domain_status: string | null
}

export function rowToOrgBrand(row: OrganizationBrandingRow): OrgBrand {
  const portalName = row.portal_name ?? DEFAULT_BRAND.portalName
  const hidePlatformBranding = row.hide_platform_branding ?? false
  return {
    portalName,
    primaryLogoUrl: row.primary_logo_url,
    faviconUrl: row.favicon_url,
    primaryColor: row.primary_color ?? DEFAULT_BRAND.primaryColor,
    secondaryColor: row.secondary_color ?? DEFAULT_BRAND.secondaryColor,
    accentColor: row.accent_color ?? DEFAULT_BRAND.accentColor,
    backgroundColor: row.background_color ?? DEFAULT_BRAND.backgroundColor,
    textColor: row.text_color ?? DEFAULT_BRAND.textColor,
    sidebarColor: row.sidebar_color ?? DEFAULT_BRAND.sidebarColor,
    headingFont: row.heading_font ?? DEFAULT_BRAND.headingFont,
    bodyFont: row.body_font ?? DEFAULT_BRAND.bodyFont,
    supportEmail: row.support_email,
    supportPhone: row.support_phone,
    footerText: row.footer_text,
    customCss: row.custom_css,
    hidePlatformBranding,
    customDomain: row.custom_domain,
    domainStatus: isValidDomainStatus(row.domain_status) ? row.domain_status : 'not_configured',
    isWhiteLabeled:
      hidePlatformBranding ||
      (portalName !== DEFAULT_BRAND.portalName && portalName.length > 0),
  }
}

function isValidDomainStatus(
  s: string | null,
): s is OrgBrand['domainStatus'] {
  return s === 'not_configured' || s === 'dns_pending' || s === 'verified' || s === 'error'
}

// ════════════════════════════════════════════════════════════════════════════
// Stage 3.3 — Sub-account provisioning + impersonation
// ════════════════════════════════════════════════════════════════════════════

// ── Plans (legacy + Cowork's spec; UI shows whichever is selected) ──────────
export const SUB_ACCOUNT_PLANS = ['starter', 'growth', 'pro'] as const
export type SubAccountPlan = (typeof SUB_ACCOUNT_PLANS)[number]

// ── CreateSubAccount form payload ───────────────────────────────────────────
// Matches the create_sub_account RPC signature plus a UI-only `inviteEmail`
// flag (route handler will send a Supabase magic-link invite when true).
export const CreateSubAccountInputSchema = z.object({
  name: z.string().min(1, 'Client name is required').max(120),
  adminEmail: z.string().email().nullable().optional(),
  plan: z.enum(SUB_ACCOUNT_PLANS).default('starter'),
  agencyBilledAmount: z.number().nonnegative().nullable().optional(),
  aiMinutesLimit: z.number().int().positive().nullable().optional(),
  snapshotId: z.string().uuid().nullable().optional(),
  sendInvite: z.boolean().default(true),
})
export type CreateSubAccountInput = z.infer<typeof CreateSubAccountInputSchema>

// ── ImpersonationContext: shape returned by get_active_impersonation RPC ────
export interface ImpersonationContext {
  sessionId: string
  parentOrganizationId: string  // the agency org
  subOrganizationId: string     // the org being viewed
  actorUserId: string           // which agency admin
  expiresAt: string             // ISO timestamp
  subOrgName: string
  actorEmail: string | null
}

// ── AgencyClient: row shape from agency_clients_v ───────────────────────────
// Use this for the /agency/dashboard + /agency/clients table rendering.
// snake_case to match Supabase return shape (no remapping needed for SELECT).
export interface AgencyClientRow {
  organization_id: string
  name: string
  parent_organization_id: string
  plan: string | null
  agency_billed_amount: number | null
  ai_minutes_limit: number | null
  ai_minutes_used: number | null
  minutes_utilization: number | null
  minutes_overage: number | null
  is_active: boolean
  custom_domain: string | null
  domain_status: string | null
  hide_platform_branding: boolean | null
  created_at: string
  updated_at: string
  last_call_at: string | null
  calls_this_month: number
  calls_today: number
  contact_count: number
  agent_count: number
  is_being_impersonated: boolean
}

// ── AgencyMrrSummary: row shape from agency_mrr_summary_v ───────────────────
export interface AgencyMrrSummary {
  agency_organization_id: string
  agency_name: string
  total_sub_accounts: number
  active_sub_accounts: number
  suspended_sub_accounts: number
  total_mrr: number
  total_minutes_allotted: number
  total_minutes_used: number
  total_minutes_overage: number
  calls_this_month: number
}

// ── Cookie name (single source of truth) ────────────────────────────────────
// Stage 3.3 uses one httpOnly cookie. The token resolves the entire context
// via the get_active_impersonation RPC, so no second cookie is needed.
export const IMPERSONATION_COOKIE_NAME = 'lf_impersonation_token'
export const IMPERSONATION_DEFAULT_TTL_SECONDS = 15 * 60  // 15 min
export const IMPERSONATION_MAX_TTL_SECONDS = 60 * 60      // 60 min (RPC enforces)
