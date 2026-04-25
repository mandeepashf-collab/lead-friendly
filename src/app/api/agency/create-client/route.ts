import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { CreateSubAccountInputSchema } from '@/lib/schemas/stage3'

// ────────────────────────────────────────────────────────────────────────────
// Stage 3.3 — POST /api/agency/create-client
// ────────────────────────────────────────────────────────────────────────────
// Replaces the pre-Stage-3.1 password-based provisioning flow. Now:
//   1. Calls create_sub_account RPC (creates the org row + TCPA defaults +
//      audit log; SECURITY DEFINER enforces caller is agency owner/admin).
//   2. If sendInvite is true and adminEmail is set, sends a Supabase magic-
//      link invite to that email. The invited user is linked to the new
//      sub-account via profiles.organization_id on first signin.
//   3. Returns the new sub-account id (and the invite status if applicable).
//
// No password is created server-side. The agency hands the client either:
//   - the magic-link email arrived in their inbox, OR
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

  // ── Create the sub-account via RPC (RPC enforces agency owner/admin) ─────
  const { data: newOrgId, error: rpcError } = await supabase.rpc(
    'create_sub_account',
    {
      p_name: input.name,
      p_admin_email: input.adminEmail ?? null,
      p_plan: input.plan,
      p_agency_billed_amount: input.agencyBilledAmount ?? null,
      p_snapshot_id: input.snapshotId ?? null,
      p_ai_minutes_limit: input.aiMinutesLimit ?? null,
    },
  )

  if (rpcError) {
    // Map common RPC errors to friendly status codes.
    // 42501 = insufficient_privilege; P0001 = our RAISE EXCEPTION.
    const status =
      rpcError.code === '42501' ? 403
      : rpcError.code === 'P0001' ? 400
      : 500
    return NextResponse.json({ error: rpcError.message }, { status })
  }

  // ── Optional: send a Supabase magic-link invite to the admin email ───────
  let inviteResult: { sent: boolean; userId?: string; error?: string } | null = null

  if (input.sendInvite && input.adminEmail) {
    try {
      const adminClient = createServiceClient()
      const { data: invited, error: inviteError } =
        await adminClient.auth.admin.inviteUserByEmail(input.adminEmail, {
          data: {
            sub_organization_id: newOrgId,
            invited_by_user_id: user.id,
            role: 'owner',
          },
        })

      if (inviteError) {
        // Org is already created; don't fail the whole request, but flag it.
        inviteResult = { sent: false, error: inviteError.message }
      } else if (invited.user) {
        // Link the invited user's profile to the new sub-org so RLS resolves
        // correctly the moment they confirm their email and sign in.
        // We use the service client so this insert isn't blocked by RLS
        // (the user has no session yet, can't satisfy the policy).
        const { error: profileErr } = await adminClient
          .from('profiles')
          .upsert({
            id: invited.user.id,
            email: input.adminEmail,
            organization_id: newOrgId,
            role: 'owner',
          })

        if (profileErr) {
          inviteResult = {
            sent: true,
            userId: invited.user.id,
            error: `invite sent but profile link failed: ${profileErr.message}`,
          }
        } else {
          inviteResult = { sent: true, userId: invited.user.id }
        }
      } else {
        inviteResult = { sent: false, error: 'invite returned no user' }
      }
    } catch (e: unknown) {
      inviteResult = {
        sent: false,
        error: e instanceof Error ? e.message : 'unknown invite error',
      }
    }
  }

  return NextResponse.json({
    success: true,
    subOrganizationId: newOrgId,
    invite: inviteResult,
  })
}
