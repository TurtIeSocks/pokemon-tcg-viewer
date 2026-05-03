import { useSearchParams } from "react-router";

interface UpdateOptions {
	/** When true, replaces the current history entry instead of pushing a new one. */
	replace?: boolean;
}

type SetSetId = (id: string | null, opts?: UpdateOptions) => void;
type SetDex = (n: number | null, opts?: UpdateOptions) => void;

/**
 * URL-backed selection for the By-Set view. Reads/writes the `setId`
 * search parameter. Pass `{ replace: true }` for non-user-driven updates
 * (e.g. default-fallback selection on first load) to avoid polluting
 * back history.
 */
export function useSetIdParam(): [string | null, SetSetId] {
	const [params, setParams] = useSearchParams();
	const setId = params.get("setId");
	const setSetId: SetSetId = (id, opts) => {
		const next = new URLSearchParams(params);
		if (id) next.set("setId", id);
		else next.delete("setId");
		setParams(next, opts?.replace ? { replace: true } : undefined);
	};
	return [setId, setSetId];
}

/**
 * URL-backed selection for the By-Pokémon view. Reads/writes the `dex`
 * search parameter as a number. Returns null for missing or non-numeric
 * values.
 */
export function usePokedexParam(): [number | null, SetDex] {
	const [params, setParams] = useSearchParams();
	const raw = params.get("dex");
	const parsed = raw === null ? null : Number.parseInt(raw, 10);
	const dex = parsed !== null && Number.isFinite(parsed) ? parsed : null;
	const setDex: SetDex = (n, opts) => {
		const next = new URLSearchParams(params);
		if (n !== null && Number.isFinite(n)) next.set("dex", String(n));
		else next.delete("dex");
		setParams(next, opts?.replace ? { replace: true } : undefined);
	};
	return [dex, setDex];
}
