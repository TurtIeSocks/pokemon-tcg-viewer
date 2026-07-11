import { cardRouteParams } from "@/lib/card-route";
import type { CardPriceEntry, FxTable } from "@/lib/corpus/price-types";
import { faceLanguageFor, type SupportedLanguage } from "@/lib/languages";
import { type QrSvg, qrSvgPath } from "@/lib/qr";
import type { SlugIndex } from "@/lib/slug";
import type { ContentRow } from "@/store/ui-prefs";
import { formatPrice } from "@/store/userland/money";
import { unitMarketValueUsdCents } from "@/store/userland/valuation";
import { cdnImage } from "../holo-card/cdn-image";
import type { HoloCardData } from "../holo-card/types";

/** Output width (px) requested from the image CDN for a `cardImage` row. Generous
 * enough for a placeholder printed at any of the row's mm sizes at ~300dpi; wsrv's
 * `we` flag prevents upscaling past the source. */
const CARD_IMAGE_CDN_WIDTH = 480;

/** Per-placeholder derived extras; each field null when unavailable. */
export interface PlaceholderExtra {
	/** Formatted market price ("$4.20"), or null when the card is unpriced. */
	price: string | null;
	/** Prebuilt QR for the card's /prices page, or null when unresolvable. */
	qr: QrSvg | null;
	/** CDN image URL for the card, or null when the card has no source image. */
	image: string | null;
}

/**
 * The resolved content of one {@link ContentRow} for one card. `null` (returned by
 * {@link resolvePlaceholderRow}) means "no content for this card" — the row is
 * omitted entirely rather than reserving blank space (an unpriced card drops its
 * price row, a card with no art drops its image row, and so on).
 */
export type ResolvedRowContent =
	| { kind: "text"; value: string }
	| { kind: "image"; src: string }
	| { kind: "qr"; qr: QrSvg };

/** A non-empty trimmed string as a text row, else null (drives null-collapse). */
function textRow(value: string | null | undefined): ResolvedRowContent | null {
	const t = value?.trim();
	return t ? { kind: "text", value: t } : null;
}

/**
 * Resolve one content row to its printable content for a given card, or `null`
 * when the card supplies nothing for it. Pure: card fields + precomputed
 * {@link PlaceholderExtra} in, content out — so the renderer stays declarative and
 * the null-collapse is unit-testable. Text-bearing rows collapse on an empty value;
 * `price`/`qr`/`cardImage` collapse on a null extra.
 */
export function resolvePlaceholderRow(
	row: ContentRow,
	card: HoloCardData,
	extra: PlaceholderExtra | undefined,
): ResolvedRowContent | null {
	switch (row.type) {
		case "cardName":
			return textRow(card.name);
		case "number": {
			const n = card.cardNumber?.toString().trim();
			return n ? { kind: "text", value: `#${n}` } : null;
		}
		case "setName":
			return textRow(card.setName);
		case "seriesName":
			return textRow(card.setSeries);
		case "rarity":
			return textRow(card.rarity);
		case "price":
			return textRow(extra?.price ?? null);
		case "customText":
			return textRow(row.text ?? null);
		case "cardImage": {
			const src = extra?.image ?? null;
			return src ? { kind: "image", src } : null;
		}
		case "qr": {
			const qr = extra?.qr ?? null;
			return qr ? { kind: "qr", qr } : null;
		}
		default:
			return null;
	}
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
			image: card.imageUrl
				? cdnImage(card.imageUrl, { w: CARD_IMAGE_CDN_WIDTH })
				: null,
		});
	}
	return out;
}
