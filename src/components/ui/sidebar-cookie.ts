// Pure, client-safe cookie helpers for the sidebar drawer state.
//
// Kept in its own module (no React, no server-only imports) so BOTH sides agree
// on the cookie's identity + parse rules:
//   - the client writes it (sidebar.tsx `setOpen` → document.cookie),
//   - the server reads the incoming Cookie header (src/server/sidebar-state.ts),
//   - the client re-reads document.cookie during hydration (root beforeLoad),
// all through these functions, so the value passed to `defaultOpen` is identical
// on the SSR pass and the hydration pass (no flash, no hydration mismatch).

export const SIDEBAR_COOKIE_NAME = "sidebar_state";
export const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

/**
 * Parse the `sidebar_state` cookie value into a boolean.
 * Absent or unrecognised → `true` (drawer defaults to open).
 */
export function parseSidebarState(value: string | null | undefined): boolean {
	if (value === "false") return false;
	if (value === "true") return true;
	return true;
}

/**
 * Read a single cookie value out of a raw cookie string (a `Cookie:` header or
 * `document.cookie`). Returns the value, or `null` when the cookie is absent.
 * Pure — takes the string explicitly so it works on both server and client.
 */
export function readCookieValue(
	cookieString: string,
	name: string,
): string | null {
	for (const part of cookieString.split(";")) {
		const eq = part.indexOf("=");
		if (eq === -1) continue;
		if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
	}
	return null;
}
