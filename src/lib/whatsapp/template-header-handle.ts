import { uploadResumableMedia } from '@/lib/whatsapp/meta-api'
import type { TemplatePayload } from '@/lib/whatsapp/template-validators'

/**
 * Meta requires an `example.header_handle` (from the Resumable Upload
 * API) to create/edit a template with an IMAGE header — a plain public
 * URL is not accepted at creation time. This helper turns the template's
 * `header_media_url` (whether the user uploaded a file or pasted a link)
 * into a handle and writes it onto the payload, so both the upload path
 * and the legacy URL path actually succeed.
 *
 * No-op unless the header is an image that has a URL but no handle yet.
 * Image-only for now (the #230 scope); video/document handles can follow
 * the same shape.
 */

// Meta's image-header sample limits.
const MEDIA_LIMITS = {
  image: {
    maxBytes: 5 * 1024 * 1024,
    mimeTypes: ['image/jpeg', 'image/png'],
    defaultMime: 'image/jpeg',
    fileName: 'header.jpg',
  },
  video: {
    maxBytes: 16 * 1024 * 1024,
    mimeTypes: ['video/mp4'],
    defaultMime: 'video/mp4',
    fileName: 'header.mp4',
  },
  document: {
    maxBytes: 100 * 1024 * 1024,
    mimeTypes: ['application/pdf'],
    defaultMime: 'application/pdf',
    fileName: 'header.pdf',
  },
} as const

export async function ensureImageHeaderHandle(
  payload: TemplatePayload,
  accessToken: string,
): Promise<void> {
  if (
  payload.header_type !== 'image' &&
  payload.header_type !== 'video' &&
  payload.header_type !== 'document'
) {
  return
}
  if (payload.header_handle) return // already have one
  if (!payload.header_media_url) return // validator already requires url-or-handle

  const appId = process.env.META_APP_ID
  if (!appId) {
    throw new Error(
      'Image-header templates need META_APP_ID set (used for Meta’s Resumable Upload). Add it to your environment, or remove the image header.',
    )
  }

  // Fetch the sample image bytes (works for our uploaded chat-media URL
  // and for a manually-pasted public link).
  let res: Response
  try {
    res = await fetch(payload.header_media_url)
  } catch {
    throw new Error('Could not fetch the header image URL. Make sure it is publicly reachable.')
  }
  if (!res.ok) {
    throw new Error(`Header image URL returned ${res.status}. It must be publicly reachable.`)
  }
const config = MEDIA_LIMITS[payload.header_type]
  const contentType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
  if (contentType && !config.mimeTypes.includes(contentType as never)) {
    throw new Error(
  `Unsupported ${payload.header_type} format (${contentType}).`
)
  }

  const bytes = new Uint8Array(await res.arrayBuffer())
  if (bytes.byteLength === 0) {
    throw new Error('Header image is empty.')
  }
 if (bytes.byteLength > config.maxBytes) {
    throw new Error(
      `Header image is ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB — Meta's limit is 5 MB.`,
    )
  }

 const mimeType =
  config.mimeTypes.includes(contentType as never)
    ? contentType
    : config.defaultMime

const fileName =
  contentType === 'image/png'
    ? 'header.png'
    : config.fileName

  const { handle } = await uploadResumableMedia({
    appId,
    accessToken,
    fileName,
    mimeType,
    bytes,
  })
  payload.header_handle = handle
}
