-- ============================================================================
-- Migration 026 — Stage 3.2 branding asset storage
-- ============================================================================
-- Creates the `branding-assets` bucket used by /api/org/[id]/brand/upload.
-- Policies:
--   - public read (logos/favicons are served via <img src>, not signed URLs)
--   - insert/update/delete scoped to the caller's org by folder prefix
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'branding-assets',
  'branding-assets',
  true,
  2097152, -- 2 MiB
  ARRAY[
    'image/png',
    'image/jpeg',
    'image/svg+xml',
    'image/webp',
    'image/x-icon',
    'image/vnd.microsoft.icon'
  ]
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Public read
DROP POLICY IF EXISTS "branding_assets_public_read" ON storage.objects;
CREATE POLICY "branding_assets_public_read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'branding-assets');

-- Scoped write — first folder must match caller's organization_id
DROP POLICY IF EXISTS "branding_assets_org_insert" ON storage.objects;
CREATE POLICY "branding_assets_org_insert" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'branding-assets'
    AND (storage.foldername(name))[1] = (
      SELECT organization_id::text
      FROM public.profiles
      WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "branding_assets_org_update" ON storage.objects;
CREATE POLICY "branding_assets_org_update" ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'branding-assets'
    AND (storage.foldername(name))[1] = (
      SELECT organization_id::text
      FROM public.profiles
      WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "branding_assets_org_delete" ON storage.objects;
CREATE POLICY "branding_assets_org_delete" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'branding-assets'
    AND (storage.foldername(name))[1] = (
      SELECT organization_id::text
      FROM public.profiles
      WHERE id = auth.uid()
    )
  );
