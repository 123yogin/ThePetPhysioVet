/**
 * Client-side guard rails for file uploads.
 *
 * The server caps every upload at 10 MB (docs/API_CONTRACT.md "Uploaded
 * files") and answers 400 "File is too large (max 10 MB).". Checking here as
 * well saves a clinician on a slow connection from sending 50 MB only to be
 * told no. The server stays the authority; this is a UX guard.
 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const UPLOAD_TOO_LARGE = 'File is too large (max 10 MB).';

/** An error message if `file` cannot be uploaded, else null. */
export function uploadSizeError(file: File | null | undefined): string | null {
  if (file && file.size > MAX_UPLOAD_BYTES) return UPLOAD_TOO_LARGE;
  return null;
}

/**
 * The message to flash when an upload request fails.
 *
 * The API returns problem+json with a readable `detail`, which `http()` puts in
 * `err.message`. A hosting gateway can still reject an oversized body (413)
 * before Django sees it, with no JSON at all — that would otherwise surface as
 * a bare status text.
 */
export function uploadErrorMessage(err: unknown, fallback: string): string {
  const e = err as { message?: string; status?: number } | null;
  if (e?.status === 413) return 'This file is too large to upload. Please choose a smaller file.';
  return e?.message || fallback;
}
