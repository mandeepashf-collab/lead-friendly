import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/agency/snapshots/[id]/apply
// Apply a snapshot's config to a target sub-account
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { id: snapshotId } = await params
    const { target_account_id } = await request.json()

    if (!target_account_id) {
      return NextResponse.json(
        { error: 'target_account_id required' },
        { status: 400 }
      )
    }

    // Get the snapshot
    const { data: snapshot } = await supabase
      .from('snapshots')
      .select('id, agency_id, config, usage_count')
      .eq('id', snapshotId)
      .single()

    if (!snapshot) {
      return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 })
    }

    // Verify target account belongs to the same agency
    const { data: targetAccount } = await supabase
      .from('sub_accounts')
      .select('id, organization_id')
      .eq('id', target_account_id)
      .eq('agency_id', snapshot.agency_id)
      .single()

    if (!targetAccount) {
      return NextResponse.json(
        { error: 'Target account not found or does not belong to agency' },
        { status: 404 }
      )
    }

    // Extract AI agents config from snapshot
    const config = snapshot.config as any
    const aiAgentsConfig = config?.ai_agents || []

    // Apply each AI agent config to the target account
    if (aiAgentsConfig.length > 0) {
      for (const agentConfig of aiAgentsConfig) {
        // Check if agent already exists in target account
        const { data: existingAgent } = await supabase
          .from('ai_agents')
          .select('id')
          .eq('organization_id', targetAccount.organization_id)
          .eq('name', agentConfig.name)
          .single()

        if (existingAgent) {
          // Update existing agent
          await supabase
            .from('ai_agents')
            .update({
              type: agentConfig.type,
              voice_id: agentConfig.voice_id,
              voice_name: agentConfig.voice_name,
              system_prompt: agentConfig.system_prompt,
              greeting_message: agentConfig.greeting_message,
              retell_agent_id: agentConfig.retell_agent_id,
              retell_llm_id: agentConfig.retell_llm_id,
              response_latency: agentConfig.response_latency,
              cost_per_minute: agentConfig.cost_per_minute,
              knowledge_base_files: agentConfig.knowledge_base_files,
              settings: agentConfig.settings,
            })
            .eq('id', existingAgent.id)
        } else {
          // Create new agent
          await supabase.from('ai_agents').insert({
            organization_id: targetAccount.organization_id,
            name: agentConfig.name,
            type: agentConfig.type,
            voice_id: agentConfig.voice_id,
            voice_name: agentConfig.voice_name,
            system_prompt: agentConfig.system_prompt,
            greeting_message: agentConfig.greeting_message,
            retell_agent_id: agentConfig.retell_agent_id,
            retell_llm_id: agentConfig.retell_llm_id,
            response_latency: agentConfig.response_latency,
            cost_per_minute: agentConfig.cost_per_minute,
            knowledge_base_files: agentConfig.knowledge_base_files,
            settings: agentConfig.settings,
          })
        }
      }
    }

    // Increment usage count
    await supabase
      .from('snapshots')
      .update({ usage_count: snapshot.usage_count + 1 })
      .eq('id', snapshotId)

    return NextResponse.json(
      {
        success: true,
        message: `Snapshot applied to ${targetAccount.id}`,
      },
      { status: 200 }
    )
  } catch (err: any) {
    console.error('Apply snapshot error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
