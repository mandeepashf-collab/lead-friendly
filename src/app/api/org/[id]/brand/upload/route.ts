import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// ────────────────────────────────────────────────────────────────────────────
// Stage 3.2 — /api/org/[id]/brand/upload
// ────────────────────────────────────────────────────────────────────────────
// POST multipart/form-data with fields:
//   file: the image
//   kind: 'logo' | 'favicon'
//
// Validates: authenticated owner/admin of org, file size ≤ 2MB, mime whitelist.
// Uploads to Supabase Storage bucket `branding-assets` at path
// `{org_id}/{kind}-{timestamp}.{ext}` and returns { url } (public URL).
// ────────────────────────────────────────────────────────────────────────────

const LOGO_MIME = new Set(['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'])
const FAVICON_MIME = new Set(['image/png', 'image/x-icon', 'image/vnd.microsoft.icon'])
const MAX_BYTES = 2 * 1024 * 1024 // 2MB

function extFromMime(m: string): string {
  switch (m) {
    case 'image/png': return 'png'
    case 'image/jpeg': return 'jpg'
    case 'image/svg+xml': return 'svg'
    case 'image/webp': return 'webp'
    case 'image/x-icon':
    case 'image/vnd.microsoft.icon': return 'ico'
    default: return 'bin'
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: orgId } = await params

  // AuthN + AuthZ
  const supabase = await createClient()
  const { data: { user }, error: userErr } = await supabase.auth.getUser()
  if (!user || userErr) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id, role')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.organization_id || profile.organization_id !== orgId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  if (profile.role !== 'owner' && profile.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden_role' }, { status: 403 })
  }

  // Parse multipart
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'invalid_form' }, { status: 400 })
  }

  const file = form.get('file')
  const kind = form.get('kind')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'missing_file' }, { status: 400 })
  }
  if (kind !== 'logo' && kind !== 'favicon') {
    return NextResponse.json({ error: 'invalid_kind' }, { status: 400 })
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: 'file_too_large', maxBytes: MAX_BYTES },
      { status: 413 },
    )
  }

  const allowed = kind === 'logo' ? LOGO_MIME : FAVICON_MIME
  if (!allowed.has(file.type)) {
    return NextResponse.json(
      { error: 'unsupported_mime', allowed: Array.from(allowed) },
      { status: 415 },
    )
  }

  const ext = extFromMime(file.type)
  const filename = `${orgId}/${kind}-${Date.now()}.${ext}`

  const svc = createServiceClient()
  const arrayBuffer = await file.arrayBuffer()
  const { error: uploadErr } = await svc.storage
    .from('branding-assets')
    .upload(filename, arrayBuffer, {
      contentType: file.type,
      upsert: false,
      cacheControl: '3600',
    })

  if (uploadErr) {
    console.error('[brand/upload] storage.upload failed:', uploadErr)
    return NextResponse.json({ error: 'upload_failed' }, { status: 500 })
  }

  const { data: urlData } = svc.storage
    .from('branding-assets')
    .getPublicUrl(filename)

  return NextResponse.json({ url: urlData.publicUrl, path: filename })
}
