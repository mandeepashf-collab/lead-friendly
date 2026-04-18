import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/agency/snapshots?agency_id=uuid
// List all snapshots for an agency
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const agencyId = request.nextUrl.searchParams.get('agency_id')
    if (!agencyId) {
      return NextResponse.json(
        { error: 'agency_id query param required' },
        { status: 400 }
      )
    }

    const { data: snapshots, error } = await supabase
      .from('snapshots')
      .select('id, name, description, industry, thumbnail_color, usage_count')
      .eq('agency_id', agencyId)
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ snapshots })
  } catch (err: any) {
    console.error('GET snapshots error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST /api/agency/snapshots
// Create a new snapshot from a source account's AI agent config
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const {
      agency_id,
      source_account_id,
      name,
      description,
      industry,
      thumbnail_color,
    } = await request.json()

    if (!agency_id || !source_account_id || !name) {
      return NextResponse.json(
        { error: 'Missing required fields: agency_id, source_account_id, name' },
        { status: 400 }
      )
    }

    // Verify source account belongs to agency
    const { data: sourceAccount } = await supabase
      .from('sub_accounts')
      .select('id')
      .eq('id', source_account_id)
      .eq('agency_id', agency_id)
      .single()

    if (!sourceAccount) {
      return NextResponse.json(
        { error: 'Source account not found or does not belong to agency' },
        { status: 404 }
      )
    }

    // Get AI agents config from the source account
    // Assuming the source_account_id links to organization somehow
    // We'll fetch the organization_id from sub_accounts first
    const { data: subAccountData } = await supabase
      .from('sub_accounts')
      .select('organization_id')
      .eq('id', source_account_id)
      .single()

    let config = {}
    if (subAccountData?.organization_id) {
      // Get AI agents for this organization
      const { data: aiAgents } = await supabase
        .from('ai_agents')
        .select(
          'id, name, type, voice_id, voice_name, system_prompt, greeting_message, retell_agent_id, retell_llm_id, response_latency, cost_per_minute, knowledge_base_files, settings'
        )
        .eq('organization_id', subAccountData.organization_id)

      config = {
        ai_agents: aiAgents || [],
        captured_at: new Date().toISOString(),
      }
    }

    // Create snapshot
    const { data: snapshot, error } = await supabase
      .from('snapshots')
      .insert({
        agency_id,
        source_account_id,
        name,
        description: description || null,
        industry: industry || 'General',
        thumbnail_color: thumbnail_color || '#6366f1',
        config,
      })
      .select('id, name, description, industry, thumbnail_color, usage_count')
      .single()

    if (error) throw error

    return NextResponse.json({ snapshot }, { status: 201 })
  } catch (err: any) {
    console.error('POST snapshot error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
