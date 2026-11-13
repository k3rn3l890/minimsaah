/**
 * Shared staff-authorization decision for the privileged API doors
 * (api/admin/delete.js, api/upload-approve.js).
 *
 * The database profile (public.users) is the ONLY source of truth. A
 * role claim inside the JWT's user_metadata is never consulted here:
 * Supabase lets any account edit its own user_metadata (the app itself
 * does it for names), so a self-written role claim must never grant
 * power. Supabase-side RLS helpers (is_staff/is_owner_editor) follow
 * the same rule after supabase/phase1_hardening.sql runs.
 *
 * Fail closed: a missing profile row, a read error, a blank role, or a
 * status other than ACTIVE all deny.
 *
 * Pure function - no network, no side effects. Exhaustively tested in
 * tests/smoke.mjs (staff access decision suite).
 */

/**
 * @param {{ role?: unknown, status?: unknown } | null | undefined} profile
 *   The row read from public.users for the caller's id, or null when the
 *   row is missing / the read failed.
 * @param {string[]} allowedRoles Roles this door accepts.
 * @returns {{ allowed: boolean, role: string, reason: string }}
 *   reason: 'ok' | 'no-profile' | 'no-status' | 'suspended' | 'no-role' | 'role'
 */
export function staffDecision(profile, allowedRoles) {
  if (!Array.isArray(allowedRoles)) allowedRoles = [];
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    return { allowed: false, role: '', reason: 'no-profile' };
  }
  const role = typeof profile.role === 'string' ? profile.role : '';
  const status = typeof profile.status === 'string' ? profile.status : '';
  if (status !== 'ACTIVE') {
    // Blank status fails closed too: only an explicit ACTIVE profile passes.
    return { allowed: false, role, reason: status ? 'suspended' : 'no-status' };
  }
  if (!role) {
    return { allowed: false, role, reason: 'no-role' };
  }
  if (!allowedRoles.includes(role)) {
    return { allowed: false, role, reason: 'role' };
  }
  return { allowed: true, role, reason: 'ok' };
}
