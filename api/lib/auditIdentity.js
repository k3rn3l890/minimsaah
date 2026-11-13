/**
 * Identity resolution for audit rows written through /api/log-event.
 *
 * The audit table feeds security decisions (the delete door's daily cap),
 * so every row must say who it came from and how much that identity is
 * trusted:
 *
 * - source 'verified': a Bearer JWT was checked against Supabase Auth.
 *   The row's email becomes the account's real email - the caller-posted
 *   email is IGNORED, so nobody can sign somebody else's name.
 * - source 'client': no token (or a broken one). The email is whatever
 *   the visitor posted. Telemetry only, never audit evidence.
 *
 * 'login_success' is special: it exists to record real sign-ins, so it is
 * refused without a verified token AND a real account email. A forger can
 * otherwise mint fake sign-in history for any address.
 *
 * Pure function - no network, no side effects. Exhaustively tested in
 * tests/smoke.mjs (phase 2 audit identity suite).
 */

const REQUIRE_VERIFIED = ['login_success'];

/** Events that may only be recorded behind a verified session token. */
export function eventRequiresVerifiedToken(event) {
  return REQUIRE_VERIFIED.includes(event);
}

function asVerifiedUser(u) {
  return !!u
    && typeof u === 'object'
    && !Array.isArray(u)
    && typeof u.id === 'string'
    && u.id.length > 0;
}

/**
 * @param {string} event allowlisted event name
 * @param {{ id?: unknown, email?: unknown } | null | undefined} verifiedUser
 *   the Supabase Auth user when a Bearer JWT was presented AND verified,
 *   else null.
 * @param {string} postedEmail caller-supplied email (already trimmed/capped)
 * @returns {{ ok: boolean, email: string|null, source: 'verified'|'client',
 *             actorId: string|null }}
 */
export function auditIdentity(event, verifiedUser, postedEmail) {
  const needs = eventRequiresVerifiedToken(event);
  const isUser = asVerifiedUser(verifiedUser);
  const verifiedEmail = isUser
    && typeof verifiedUser.email === 'string'
    && verifiedUser.email !== ''
    ? verifiedUser.email
    : null;
  if (needs) {
    if (!isUser || !verifiedEmail) {
      return { ok: false, email: null, source: 'client', actorId: null };
    }
    return { ok: true, email: verifiedEmail, source: 'verified', actorId: verifiedUser.id };
  }
  if (isUser) {
    return { ok: true, email: verifiedEmail, source: 'verified', actorId: verifiedUser.id };
  }
  const email = typeof postedEmail === 'string' && postedEmail !== '' ? postedEmail : null;
  return { ok: true, email, source: 'client', actorId: null };
}
