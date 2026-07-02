import type { LinkProps } from "@tanstack/react-router";
import { getActiveI18nLang } from "../store/corpus/i18n-active";
import {
	faceLanguageFor,
	isSupportedLanguage,
	type Region,
	type SupportedLanguage,
} from "./languages";
import type { SlugIndex } from "./slug";

export type CardTab = "details" | "collection" | "pricing";

declare module "@tanstack/react-router" {
	interface HistoryState {
		/**
		 * In-app card-overlay target as "series/set/slug". Set on the masked
		 * navigation so the root CardOverlay knows which card to show; absent on a
		 * cold load of the canonical URL (which renders the full page instead).
		 */
		cardOverlay?: string;
		/** Active card-overlay tab. Masked to the tab's canonical route. */
		cardTab?: CardTab;
	}
}

export interface CardRouteParams {
	series: string;
	set: string;
	card: string;
}

export const TAB_MASK = {
	details: "/$series/$set/$card",
	collection: "/$series/$set/$card/manage",
	pricing: "/$series/$set/$card/prices",
} as const satisfies Record<CardTab, LinkProps["to"]>;

/**
 * Shared masked-overlay nav for a given tab: stay on the current route, set
 * `cardOverlay` + `cardTab` in history state, and mask the URL to the tab's
 * canonical route. The three named helpers below delegate here.
 *
 * `lang` is the active display language. When it's a non-English language,
 * the generated link carries `?lang` (merged onto the existing search) so a
 * shared/cold-loaded link re-selects that language (and, for an Asian
 * language, the Asian catalog region — see `regionForLanguage`). Omitting
 * `lang` (or passing `"en"`) preserves today's plain passthrough behavior
 * byte-for-byte: Western links are unaffected by this.
 */
export function cardTabLinkPropsFor(
	p: CardRouteParams,
	tab: CardTab,
	lang?: SupportedLanguage | null,
): LinkProps {
	return {
		to: ".",
		search:
			lang && lang !== "en"
				? (prev: Record<string, unknown>) => ({ ...prev, lang })
				: (prev: Record<string, unknown>) => prev,
		state: (prev: Record<string, unknown>) => ({
			...prev,
			cardOverlay: `${p.series}/${p.set}/${p.card}`,
			cardTab: tab,
		}),
		mask: { to: TAB_MASK[tab], params: p },
	} as LinkProps;
}

/**
 * Resolve a card to its canonical `/$series/$set/$card` route params via the
 * slug index, or null when the set/card can't be resolved (e.g. corpus not yet
 * loaded). The same slugs the detail route resolves on the server.
 */
export function cardRouteParams(
	idx: SlugIndex,
	card: { id: string; setId: string },
): CardRouteParams | null {
	const loc = idx.setSlugById.get(card.setId);
	const cardSlug = idx.cardSlugById.get(card.id);
	if (!loc || !cardSlug) return null;
	return { series: loc.seriesSlug, set: loc.setSlug, card: cardSlug };
}

/**
 * Canonical card-detail LinkProps — the full, shareable page URL. Pass the
 * active display language to carry `?lang` for a non-English language, so a
 * shared link re-selects it (and, for an Asian language, the Asian catalog
 * region — see `regionForLanguage`). Omitting it (or `"en"`) omits `lang`,
 * matching today's behavior byte-for-byte.
 */
export function cardRouteProps(
	idx: SlugIndex,
	card: { id: string; setId: string },
	lang?: SupportedLanguage | null,
): LinkProps | null {
	const p = cardRouteParams(idx, card);
	if (!p) return null;
	return lang && lang !== "en"
		? { to: "/$series/$set/$card", params: p, search: { lang } }
		: { to: "/$series/$set/$card", params: p };
}

/**
 * In-app overlay navigation for the given canonical params: stay on the current
 * route (so the grid behind stays mounted), set `cardOverlay` in history state,
 * and MASK the URL to the canonical `/$series/$set/$card`. The root overlay
 * reads that state (see card-overlay.tsx); a cold load of the masked URL has no
 * state and falls back to the full-page route.
 *
 * `lang` is the active display language (see {@link cardTabLinkPropsFor}); pass
 * it explicitly when known, else it defaults to today's plain passthrough.
 */
export function cardModalLinkPropsFor(
	p: CardRouteParams,
	lang?: SupportedLanguage | null,
): LinkProps {
	return cardTabLinkPropsFor(p, "details", lang);
}

/**
 * {@link cardModalLinkPropsFor} resolved from a slug index, or null. Reads the
 * active display language imperatively so a link built outside a lang-bearing
 * route (e.g. a "recently viewed" tile or a search result) carries the right
 * `?lang`. The face language is chosen by the CARD's region, not the raw active
 * language: a Japanese-lineage card surfaced while browsing in English must link
 * as `ja` (its region base), since there is no English face for it — see
 * `faceLanguageFor`. A Western card under a Western language is unaffected.
 */
export function cardModalLinkProps(
	idx: SlugIndex,
	card: { id: string; setId: string; region?: Region },
): LinkProps | null {
	const p = cardRouteParams(idx, card);
	return p
		? cardModalLinkPropsFor(
				p,
				faceLanguageFor(card, activeLangOrNull() ?? "en"),
			)
		: null;
}

/**
 * In-app overlay navigation that opens the collection (manage) face over the
 * current page. Delegates to {@link cardTabLinkPropsFor} with `"collection"`,
 * which sets `cardTab: "collection"` in history state and masks the URL to
 * `/$series/$set/$card/manage`. A cold load of the masked URL falls through
 * to the real `$card_/manage` route.
 *
 * `lang` is the active display language (see {@link cardTabLinkPropsFor}).
 */
export function cardManageLinkPropsFor(
	p: CardRouteParams,
	lang?: SupportedLanguage | null,
): LinkProps {
	return cardTabLinkPropsFor(p, "collection", lang);
}

/**
 * {@link cardManageLinkPropsFor} resolved from a slug index, or null. Reads the
 * active display language imperatively and chooses the face language by the
 * card's region, same as {@link cardModalLinkProps}.
 */
export function cardManageLinkProps(
	idx: SlugIndex,
	card: { id: string; setId: string; region?: Region },
): LinkProps | null {
	const p = cardRouteParams(idx, card);
	return p
		? cardManageLinkPropsFor(
				p,
				faceLanguageFor(card, activeLangOrNull() ?? "en"),
			)
		: null;
}

/**
 * In-app overlay nav that opens the Pricing tab. Mirrors the other two.
 * `lang` is the active display language (see {@link cardTabLinkPropsFor}).
 */
export function cardPricesLinkPropsFor(
	p: CardRouteParams,
	lang?: SupportedLanguage | null,
): LinkProps {
	return cardTabLinkPropsFor(p, "pricing", lang);
}

/** The active display language, normalized to `SupportedLanguage | null`. */
function activeLangOrNull(): SupportedLanguage | null {
	const lang = getActiveI18nLang();
	return isSupportedLanguage(lang) ? lang : null;
}
