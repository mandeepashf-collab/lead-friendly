// Branding asset upload constraints — must stay in sync with Supabase
// Storage bucket `branding-assets` settings.
//
// Bucket limit (server-enforced): 5 MB, allowed mime types incl. PNG/JPEG/GIF/WebP/SVG/ICO.
// Client-side limits below are equal so users get a fast, friendly error
// before bytes leave the browser.

export const BRANDING_UPLOAD_MAX_BYTES = 5 * 1024 * 1024 // 5 MB
export const BRANDING_UPLOAD_MAX_LABEL = '5 MB'

export const BRANDING_UPLOAD_ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/x-icon',
  'image/vnd.microsoft.icon',
] as const

export type BrandingUploadMimeType =
  (typeof BRANDING_UPLOAD_ALLOWED_MIME_TYPES)[number]

export const BRANDING_UPLOAD_ACCEPT_ATTR =
  BRANDING_UPLOAD_ALLOWED_MIME_TYPES.join(',')

/**
 * Validate a file before upload. Returns null if OK, or a user-facing
 * error message string if the file should be rejected.
 */
export function validateBrandingUpload(file: File): string | null {
  if (
    !BRANDING_UPLOAD_ALLOWED_MIME_TYPES.includes(
      file.type as BrandingUploadMimeType,
    )
  ) {
    return `File type ${file.type || 'unknown'} not supported. Use PNG, JPG, GIF, WebP, SVG, or ICO.`
  }
  if (file.size > BRANDING_UPLOAD_MAX_BYTES) {
    const sizeMb = (file.size / 1024 / 1024).toFixed(1)
    return `File is ${sizeMb} MB. Max upload size is ${BRANDING_UPLOAD_MAX_LABEL}.`
  }
  return null
}
