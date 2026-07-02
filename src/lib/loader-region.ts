import { useCorpusRuntime } from "../store/corpus/corpus-runtime-store";
import {
	REGION_BASE_LANGUAGE,
	type Region,
	regionForLanguage,
} from "./languages";

/**
 * The catalog region a route loader should resolve against.
 *
 * A shared/cold-loaded link carries the region in `?lang` (a shared JP link is
 * `?lang=ja`). But an in-app navigation from the sidebar / browse tiles / home
 * has NO `?lang` — the global language picker switches region via the profile,
 * not the URL. On a client navigation the loader runs in the browser, so we can
 * read the active client region and stay in the current catalog. On SSR
 * cold-load there is no client store, so default `west` (a JP deep link must
 * carry `?lang`, which the card/detail links already do).
 */
export function loaderRegion(lang?: string | null): Region {
	if (lang) return regionForLanguage(lang);
	if (typeof window === "undefined") return "west";
	return useCorpusRuntime.getState().activeRegion;
}

/**
 * The language to hand a corpus server fn so it resolves the right region + face.
 * Uses the explicit `?lang` when present, else the region's base language (so a
 * client-side region derived from `activeRegion` still reaches the server fn,
 * which infers region from the language).
 */
export function loaderLang(lang?: string | null): string {
	if (lang) return lang;
	return REGION_BASE_LANGUAGE[loaderRegion()];
}
