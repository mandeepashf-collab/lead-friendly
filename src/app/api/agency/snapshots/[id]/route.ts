import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// DELETE /api/agency/snapshots/[id]
// Delete a snapshot
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { id: snapshotId } = await params

    const { error } = await supabase
      .from('snapshots')
      .delete()
      .eq('id', snapshotId)

    if (error) throw error

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (err: any) {
    console.error('Delete snapshot error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
