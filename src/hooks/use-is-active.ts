import { useRouterState } from "@tanstack/react-router";

/**
 * Whether the current pathname matches `path`. Defaults to a **prefix** match —
 * active for `path` itself and anything nested under it (e.g. `/base` is active
 * on `/base` and `/base/base-set`). Pass `{ exact: true }` for an exact-only
 * match (e.g. distinguishing `/vault` from `/vault/cards`).
 */
export function useIsActive(
	path: string | undefined | null,
	{ exact = false }: { exact?: boolean } = {},
) {
	return useRouterState({
		select: (s) => {
			if (!path) return false;
			const pathname = s.location.pathname;
			return exact
				? pathname === path
				: pathname === path || pathname.startsWith(`${path}/`);
		},
	});
}
