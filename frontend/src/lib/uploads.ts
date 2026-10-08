/**
 * Client-side guard rails for file uploads.
 *
 * The server caps every upload at 4 MB (docs/API_CONTRACT.md "Uploaded
 * files") and answers 400 "File is too large (max 4 MB).". The cap is below
 * Vercel's 4.5 MB request-body limit, which otherwise fails at the edge with a
 * bare 413. Checking here as well saves a clinician on a slow connection from
 * sending a large file only to be told no. The server stays the authority.
 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const UPLOAD_TOO_LARGE = 'File is too large (max 4 MB).';

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
