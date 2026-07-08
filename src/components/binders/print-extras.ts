import { cardRouteParams } from "@/lib/card-route";
import type { CardPriceEntry, FxTable } from "@/lib/corpus/price-types";
import { faceLanguageFor, type SupportedLanguage } from "@/lib/languages";
import { type QrSvg, qrSvgPath } from "@/lib/qr";
import type { SlugIndex } from "@/lib/slug";
import { formatPrice } from "@/store/userland/money";
import { unitMarketValueUsdCents } from "@/store/userland/valuation";
import type { HoloCardData } from "../holo-card/types";

/** Per-placeholder derived extras; each field null when unavailable. */
export interface PlaceholderExtra {
	/** Formatted market price ("$4.20"), or null when the card is unpriced. */
	price: string | null;
	/** Prebuilt QR for the card's /prices page, or null when unresolvable. */
	qr: QrSvg | null;
}

/**
 * Absolute `/prices` URL for a card, or null when its slug can't be resolved or
 * `origin` is empty (SSR). Appends `?lang` when the card's face language is not
 * English (mirrors `cardPricesLinkPropsFor`), so a scanned non-Western card
 * cold-loads its own catalog region.
 */
export function pricesUrl(
	card: Pick<HoloCardData, "id" | "setId" | "region">,
	slugIndex: SlugIndex | null,
	origin: string,
	activeLang: SupportedLanguage,
): string | null {
	if (!slugIndex || !origin) return null;
	const p = cardRouteParams(slugIndex, card);
	if (!p) return null;
	const lang = faceLanguageFor(card, activeLang);
	const suffix = lang !== "en" ? `?lang=${lang}` : "";
	return `${origin}/${p.series}/${p.set}/${p.card}/prices${suffix}`;
}

/**
 * Precompute the price string + QR for every card. Pure: all inputs injected, so
 * it's unit-testable and safe to memoize. The market price reuses the app's
 * canonical valuation (`unitMarketValueUsdCents` with a null printing → Normal-first
 * TCGplayer market, Cardmarket-trend fallback), so a placeholder matches the
 * Pricing tab. Unpriced → `price: null`; unresolvable slug → `qr: null`.
 */
export function buildPlaceholderExtras(args: {
	cards: HoloCardData[];
	pricesById: Map<string, CardPriceEntry> | null;
	fx: FxTable | null;
	slugIndex: SlugIndex | null;
	origin: string;
	activeLang: SupportedLanguage;
}): Map<string, PlaceholderExtra> {
	const { cards, pricesById, fx, slugIndex, origin, activeLang } = args;
	const out = new Map<string, PlaceholderExtra>();
	for (const card of cards) {
		const entry = pricesById?.get(card.id) ?? null;
		const cents = unitMarketValueUsdCents({ printing: null }, entry, fx);
		const url = pricesUrl(card, slugIndex, origin, activeLang);
		out.set(card.id, {
			price: cents == null ? null : formatPrice(cents, "USD"),
			qr: url ? qrSvgPath(url) : null,
		});
	}
	return out;
}
