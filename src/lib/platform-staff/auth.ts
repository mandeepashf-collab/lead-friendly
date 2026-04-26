import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient as createUserClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// ────────────────────────────────────────────────────────────────────────────
// Stage 3.5.1 — Platform-staff auth gate
// ────────────────────────────────────────────────────────────────────────────
// Used by /api/platform/* routes. Two pieces:
//   1. requirePlatformStaff()  — auth gate, returns either a NextResponse for
//      caller to early-return, OR a context with the user + a service-role
//      Supabase client that bypasses RLS for cross-org reads.
//   2. logStaffRead()          — optional audit log entry, ENV-flag-gated.
//
// The is_platform_staff RPC is SECURITY DEFINER and was created in Stage 3.5.0.
// Tenant RLS on contacts/calls/etc is untouched — this gate exists at the
// app layer, not the DB layer (Route B from the design doc).
// ────────────────────────────────────────────────────────────────────────────

export interface PlatformStaffContext {
  userId: string
  userEmail: string
  /** Service-role client. Bypasses RLS — use only after the gate passes. */
  admin: SupabaseClient
}

export async function requirePlatformStaff(): Promise<
  | { error: NextResponse; ctx?: never }
  | { error?: never; ctx: PlatformStaffContext }
> {
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const { data: isStaff, error: staffErr } = await userClient.rpc(
    'is_platform_staff',
    { p_user_id: user.id },
  )
  if (staffErr || !isStaff) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return {
    ctx: {
      userId: user.id,
      userEmail: user.email ?? '',
      admin: createServiceClient(),
    },
  }
}

/**
 * Optional read-event audit logger. ENV-flag-gated; default off.
 * Call AFTER successful auth, BEFORE returning data.
 *
 * As of stage 3.5.3, audit_logs.organization_id is nullable. List-view reads
 * (no specific org) pass organizationId: null and are recorded as org-agnostic
 * events. RLS keeps null-org rows invisible to tenants — only service-role
 * queries (i.e. other /api/platform/* routes) can read them.
 */
export async function logStaffRead(
  admin: SupabaseClient,
  ctx: PlatformStaffContext,
  args: {
    organizationId: string | null
    resourceType: string
    resourceId?: string | null
    resourceName?: string | null
    details?: Record<string, unknown>
  },
): Promise<void> {
  if (process.env.PLATFORM_STAFF_LOG_READS !== 'true') return

  const { error } = await admin.from('audit_logs').insert({
    organization_id: args.organizationId,
    user_id: ctx.userId,
    user_name: ctx.userEmail,
    action: 'platform_staff.read',
    resource_type: args.resourceType,
    resource_id: args.resourceId ?? null,
    resource_name: args.resourceName ?? null,
    details: args.details ?? {},
  })
  if (error) {
    // Audit logging must never break the actual request.
    console.warn('[logStaffRead] failed to insert audit row:', error.message)
  }
}
