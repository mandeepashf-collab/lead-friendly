import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { CreateSubAccountInputSchema } from '@/lib/schemas/stage3'

// ────────────────────────────────────────────────────────────────────────────
// Stage 3.3 / 3.3.3 — POST /api/agency/create-client
// ────────────────────────────────────────────────────────────────────────────
// Provisions a sub-account org under the calling agency. Order matters:
//   1. Auth + Zod validation.
//   2. If sendInvite + adminEmail: invite the admin via Supabase magic-link
//      FIRST. The is_sub_account_invite metadata flag short-circuits the
//      handle_new_user trigger so no top-level "phantom" org is spun up
//      when the invitee accepts. If the invite fails (e.g. "User already
//      registered"), we return 4xx with NO DB writes — no orphan sub-org.
//   3. Call create_sub_account RPC with the new p_admin_user_id parameter.
//      When non-null, the RPC also creates a profiles row (role=owner) +
//      a default Sales Pipeline for the sub-org. SECURITY DEFINER enforces
//      caller is agency owner/admin.
//   4. Return the new sub-account id + invite status.
//
// No password is created server-side. The agency hands the client either:
//   - the magic-link email that arrived in their inbox, OR
//   - the login URL + their email; client uses "Forgot password" to set one.
//
// Auth: the calling user's session is the auth surface. Service role key is
// only used for the magic-link invite (auth.admin.inviteUserByEmail).
// ────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // ── AuthN ────────────────────────────────────────────────────────────────
  const supabase = await createClient()
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()
  if (!user || userErr) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  // ── Parse + validate input ───────────────────────────────────────────────
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const parsed = CreateSubAccountInputSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', details: parsed.error.flatten() },
      { status: 400 },
    )
  }
  const input = parsed.data

  // ── Step 1: invite the admin first (if requested) ────────────────────────
  // Order matters. If invite fails (e.g. "User already registered"), no DB
  // writes have happened yet — the agency admin sees a clean 4xx and the
  // sub-org isn't orphaned. The is_sub_account_invite metadata flag also
  // short-circuits the handle_new_user trigger so no top-level phantom org
  // is created when the invitee accepts. Profile + default pipeline are
  // created by the create_sub_account RPC below via p_admin_user_id.
  let invitedUserId: string | null = null
  if (input.sendInvite && input.adminEmail) {
    const adminClient = createServiceClient()
    const { data: invited, error: inviteError } =
      await adminClient.auth.admin.inviteUserByEmail(input.adminEmail, {
        data: {
          is_sub_account_invite: true,
          sub_account_name: input.name,
          invited_by_user_id: user.id,
          role: 'owner',
        },
      })

    if (inviteError) {
      return NextResponse.json(
        { error: `Invite failed: ${inviteError.message}` },
        { status: 400 },
      )
    }

    invitedUserId = invited?.user?.id ?? null
  }

  // ── Step 2: create the sub-account via RPC ───────────────────────────────
  // RPC enforces caller is agency owner/admin. When p_admin_user_id is
  // non-null, the RPC also creates a profiles row (role=owner) + a default
  // Sales Pipeline for the new sub-org.
  const { data: newOrgId, error: rpcError } = await supabase.rpc(
    'create_sub_account',
    {
      p_name: input.name,
      p_admin_email: input.adminEmail ?? null,
      p_plan: input.plan,
      p_agency_billed_amount: input.agencyBilledAmount ?? null,
      p_snapshot_id: input.snapshotId ?? null,
      p_ai_minutes_limit: input.aiMinutesLimit ?? null,
      p_admin_user_id: invitedUserId,
    },
  )

  if (rpcError) {
    // RPC failed *after* a successful invite. The invited auth.users row
    // exists but is dormant (no profile = can't sign in). A future cleanup
    // cron can sweep these. Surface a clear error to the agency admin.
    // Map common RPC errors: 42501 = insufficient_privilege, P0001 = RAISE.
    const status =
      rpcError.code === '42501' ? 403
      : rpcError.code === 'P0001' ? 400
      : 500
    return NextResponse.json(
      { error: `Failed to create sub-account: ${rpcError.message}` },
      { status },
    )
  }

  return NextResponse.json({
    success: true,
    subOrganizationId: newOrgId,
    invite: invitedUserId ? { sent: true, userId: invitedUserId } : null,
  })
}
