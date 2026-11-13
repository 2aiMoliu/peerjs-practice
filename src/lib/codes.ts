/**
 * Join code = Camera's PeerJS peer id.
 * 6 chars from an unambiguous alphabet (no 0 O 1 I L), so the Viewer can
 * type it from the phone screen without glyph confusion.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function makeJoinCode(): string {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  let code = ''
  for (const b of bytes) code += ALPHABET[b % ALPHABET.length]
  return code
}

/** Normalize typed input: uppercase, strip spaces/dashes, keep alphabet chars. */
export function normalizeJoinCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/[0IL]/g, (c) => ({ I: '1', L: '1', O: '0' })[c] ?? c)
    .slice(0, 6)
}

export function isCompleteCode(code: string): boolean {
  return /^[A-Z2-9]{6}$/.test(code)
}
