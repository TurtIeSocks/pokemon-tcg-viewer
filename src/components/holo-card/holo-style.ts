import altArts from "./alternate-arts.json";
import { ptcgCardId } from "./foil-assets";
import promos from "./promos.json";
import { effectiveToClass, getEffectiveRarity } from "./rarity";

/**
 * Pokémon TCG series (lowercased `set.series`) whose classic Rare Holo cards
 * used the vintage **cosmos / galaxy** holofoil — the starfield sheen — rather
 * than a flat rainbow sheet. This is the era lever for the procedural fallback.
 *
 * ── HOW THIS INTERACTS WITH THE CDN PATH ──────────────────────────────────────
 * Modern SWSH / SV / PGO cards resolve a REAL per-card foil+mask from the CDN
 * (see useFoilAssets) and never reach this table. So this only decides the look
 * of OLDER sets, which have no CDN assets.
 *
 * ── USER-EDITABLE ─────────────────────────────────────────────────────────────
 * Add / remove series here to tune which eras render as cosmos vs the default
 * rainbow-scanline "rare holo". Values are the pokemontcg.io `series` strings,
 * lowercased. If unsure, leave a series out — it falls back to "rare holo".
 */
export const COSMOS_SERIES: ReadonlySet<string> = new Set([
	"base",
	"gym",
	"neo",
	"e-card",
	"ex",
	"pop",
	"diamond & pearl",
	"platinum",
	"heartgold & soulsilver",
	"call of legends",
	"black & white",
	"xy",
	"sun & moon",
	"np", // Nintendo Black Star Promos — vintage cosmos foil
	"legendary collection", // TCGdex gives LC its OWN serie (not "Base")
	"trainer kits", // half-deck reprints, EX→XY era art-window holos

	// --- Asian region: TCGdex `serie.name` strings (the corpus joins series
	// by NAME, and the JP names are the display strings below). Mirrors the
	// Western table era-for-era.
	"ポケットモンスターカードゲーム", // PMCG — original series (JP Base/Gym era)
	"ポケモンカード★neo", // neo
	"vs", // VS
	"web", // web
	"ポケモンカードe", // e — e-Card era
	"adv", // ADV — EX era (Ruby/Sapphire)
	"pcg", // PCG — EX era
	"legend", // L — HGSS era
	"xy break", // XYb ("xy" itself is already covered above)
	"サン＆ムーン", // SM — Sun & Moon
]);

/**
 * Specific set ids that use cosmos foil regardless of their `series` — for
 * modern-era sets that reprint/use the vintage galaxy foil. e.g. Celebrations
 * (cel25) sits under the "Sword & Shield" series but its holos are cosmos.
 * Lowercased set ids. USER-EDITABLE.
 */
export const COSMOS_SETS: ReadonlySet<string> = new Set([
	"cel25", // Celebrations
]);

/**
 * Series whose cards use the classic WotC frame: a bigger, plain-rectangle
 * art window (evolution badge overlapping its top-left corner) instead of
 * the modern layout simey's clip-path windows assume. These get vintage clip
 * variables via `data-frame="vintage"` (see rarity-styles.css); modern cards
 * are unaffected — they carry real per-card CDN masks (`.masked`) that
 * supersede clip windows entirely.
 *
 * Lowercased pokemontcg.io `series` strings. USER-EDITABLE — the lever to
 * pull when an era's foil window sits wrong: add/remove a series here, or
 * tune the inset/polygon percentages in the vintage block of
 * rarity-styles.css.
 */
export const VINTAGE_FRAME_SERIES: ReadonlySet<string> = new Set([
	"base",
	"gym",
	"neo",
	"np", // Nintendo Black Star Promos — WotC-style frame
	"legendary collection", // WotC-frame reprint set (own TCGdex serie)

	// --- Asian region equivalents (TCGdex `serie.name` strings): the JP
	// original-era frames share the WotC window geometry.
	"ポケットモンスターカードゲーム", // PMCG — original series
	"ポケモンカード★neo", // neo
	"vs", // VS
	"web", // web
]);

/**
 * e-Card era series (Expedition/Aquapolis/Skyridge + the JP e sets): rounded
 * art window plus the e-reader dot-code strips (left column + bottom row)
 * that are never foil. Gets its own knob set via data-frame="ecard"
 * (rarity-styles.css). Lowercased TCGdex `serie.name` strings. USER-EDITABLE.
 */
export const ECARD_FRAME_SERIES: ReadonlySet<string> = new Set([
	"e-card",
	"ポケモンカードe", // JP e series
]);

/**
 * EX era series (Ruby & Sapphire → Power Keepers, plus the JP ADV/PCG
 * equivalents): art window sits higher and the stage badge hangs off its
 * BOTTOM-left corner (modern frames notch the top-left). Own knob set via
 * data-frame="ex" (rarity-styles.css). Lowercased TCGdex `serie.name`
 * strings. USER-EDITABLE.
 */
export const EX_FRAME_SERIES: ReadonlySet<string> = new Set([
	"ex",
	"adv", // JP ADV — same frame
	"pcg", // JP PCG — same frame
]);

/**
 * DP era series (Diamond & Pearl, Platinum): stage badge TOP-left (like the
 * WotC vintage frame) but a lower, differently-sized art window. Own knob set
 * via data-frame="dp" (rarity-styles.css). Lowercased TCGdex `serie.name`
 * strings. USER-EDITABLE.
 *
 * NOT included yet (their windows differ — HGSS is taller, Call of Legends
 * shorter; add dedicated frames when reported): "heartgold & soulsilver",
 * "call of legends".
 */
export const DP_FRAME_SERIES: ReadonlySet<string> = new Set([
	"diamond & pearl",
	"platinum",
]);

/**
 * POP series (promo distribution) spans two frame eras: POP 1–5 use the EX
 * frame, POP 6–9 the DP frame. Lowercased set ids. USER-EDITABLE.
 */
const POP_EX_SETS: ReadonlySet<string> = new Set([
	"pop1",
	"pop2",
	"pop3",
	"pop4",
	"pop5",
]);
const POP_DP_SETS: ReadonlySet<string> = new Set([
	"pop6",
	"pop7",
	"pop8",
	"pop9",
]);

/**
 * Interpret TCGplayer price-variant keys as a holo signal:
 *   • has "holofoil"        → true  (holo printing)
 *   • has "normal", no holo → false (non-holo printing — should not foil)
 *   • no usable data        → undefined (unknown — keep the rarity heuristic)
 *
 * The API exposes no explicit holo flag, so the printing variants are the proxy.
 * `undefined` must NEVER be treated as non-holo, or real holos with missing
 * TCGplayer data (lots of vintage/foreign cards) would be wrongly flattened.
 */
export function variantsToHolo(variants?: string[]): boolean | undefined {
	if (!variants || variants.length === 0) return undefined;
	// TCGdex marks the holo printing "holo" (pokemontcg.io used "holofoil"). A holo
	// printing wins even when a "normal" printing also exists — TCGdex flags BOTH on
	// dual-print cards, and the card we render is the holo one. Checking holo before
	// normal is what stops dual-print holos from flattening to no-foil.
	if (variants.includes("holofoil") || variants.includes("holo")) return true;
	if (variants.includes("normal")) return false;
	return undefined; // e.g. reverse-only — ambiguous, defer to rarity
}

/**
 * Sets whose NON-classic cards are foiled across the ENTIRE card face:
 * Celebrations 25th-anniversary mirror confetti, and SV-era Black Star
 * Promos (SV has no art-window holos — promo foil covers the whole face).
 * These emit data-frame="fullface", which nulls every clip window in
 * rarity-styles.css. Lowercased set ids. USER-EDITABLE.
 */
export const FULLFACE_FOIL_SETS: ReadonlySet<string> = new Set([
	"cel25",
	"svp",
]);

/**
 * Celebrations Classic Collection reprints whose ORIGINAL printing is a
 * full-bleed art card (foil face-wide) rather than an art-window holo:
 * Tapu Lele GX (SM full-art), Luxray GL LV.X + Garchomp C LV.X (full-art
 * SP X cards). Everything else in the Classic Collection gets the vintage
 * art-window knobs. Lowercased card numbers. USER-EDITABLE.
 */
export const CLASSIC_FULLFACE_NUMBERS: ReadonlySet<string> = new Set([
	"60a", // Tapu Lele GX
	"109a", // Luxray GL LV.X
	"145a", // Garchomp C LV.X
]);

/** Frame treatment for the procedural clip windows (data-frame attribute). */
export type HoloFrame = "vintage" | "ecard" | "ex" | "dp" | "fullface" | null;

function frameFor(
	series?: string,
	setId?: string,
	rarity?: string,
	cardNumber?: string,
): HoloFrame {
	const sid = setId?.toLowerCase();
	if (sid && FULLFACE_FOIL_SETS.has(sid)) {
		// Classic Collection reprints keep their original frame's window;
		// the main-set cards are mirror-foiled face-wide.
		if (rarity?.toLowerCase() === "classic collection") {
			return CLASSIC_FULLFACE_NUMBERS.has((cardNumber ?? "").toLowerCase())
				? "fullface"
				: "vintage";
		}
		return "fullface";
	}
	// POP (one TCGdex series) spans two frame eras — decide by set id first.
	if (sid && POP_EX_SETS.has(sid)) return "ex";
	if (sid && POP_DP_SETS.has(sid)) return "dp";
	const ser = series?.toLowerCase();
	if (ser && ECARD_FRAME_SERIES.has(ser)) return "ecard";
	if (ser && EX_FRAME_SERIES.has(ser)) return "ex";
	if (ser && DP_FRAME_SERIES.has(ser)) return "dp";
	if (ser && VINTAGE_FRAME_SERIES.has(ser)) return "vintage";
	return null;
}

const ALT_ART_IDS: ReadonlySet<string> = new Set(altArts as string[]);
const PROMO_STYLES = promos as Record<string, { style: string; etch: string }>;

/** The two swshp promos simey hard-codes as Trainer Gallery (Special Delivery). */
const TG_PROMO_IDS = new Set(["swshp-SWSH076", "swshp-SWSH077"]);

export interface HoloPresentationInput {
	rarity?: string;
	series?: string;
	setId?: string;
	cardNumber?: string;
	subtypes?: string[];
	supertype?: string;
	/** variantsToHolo(variants) — false = known non-holo printing. */
	holo?: boolean;
	/**
	 * Render the card's REVERSE HOLO printing (foil everywhere except the art
	 * window). Mirrors simey CardProxy's `isReverse` prop: the base rarity gets
	 * a " reverse holo" suffix, which is all the reverse CSS keys on
	 * ([data-rarity$="reverse holo"]) and what routes the CDN reverse mask.
	 */
	reverse?: boolean;
}

export interface HoloPresentation {
	/**
	 * The simey-canonical rarity the CSS keys on via [data-rarity="…"], or null
	 * for glare-only cards (commons / known non-holo printings).
	 */
	effectiveRarity: string | null;
	/** True for Trainer/Galar Gallery cards → data-trainer-gallery="true". */
	trainerGallery: boolean;
	/**
	 * Procedural clip-window treatment → data-frame attribute: "vintage"
	 * (WotC-style windows, user-tunable knobs) or "fullface" (no clip — the
	 * whole card face is foil, e.g. Celebrations mirror confetti). Masked
	 * (CDN) cards ignore this entirely.
	 */
	frame: HoloFrame;
	/** Internal class (tests/debugging); CSS keys on data-rarity, not this. */
	className: string;
}

/**
 * Full presentation router — a 1:1 port of simey's CardProxy.svelte rarity
 * pipeline, plus our era-aware cosmos routing and the holo-printing override.
 *
 * Order mirrors CardProxy: gallery-strip → promo remap → shiny-vault remap →
 * alternate-art remap. The effective rarity lands in data-rarity (lowercase),
 * which is what every selector in rarity-styles.css matches against.
 */
export function holoPresentation(
	input: HoloPresentationInput,
): HoloPresentation {
	const {
		rarity,
		series,
		setId,
		cardNumber,
		subtypes,
		supertype,
		holo,
		reverse,
	} = input;
	void supertype; // routing is rarity/number-driven; supertype flows via data attrs

	// Reverse holo printing: a per-PRINTING override, decided before everything
	// else (a reverse is always physically foil, whatever the base rarity or
	// the noisy variant flags say). CardProxy: rarity + " Reverse Holo".
	const frame = frameFor(series, setId, rarity, cardNumber);

	if (reverse) {
		const eff = `${(rarity ?? "common").toLowerCase()} reverse holo`;
		return {
			effectiveRarity: eff,
			trainerGallery: false,
			frame,
			className: effectiveToClass(eff),
		};
	}

	let eff = getEffectiveRarity(rarity);

	// A vintage-era card (galaxy-foil years) OR a specific cosmos set.
	const inCosmosEra =
		(series && COSMOS_SERIES.has(series.toLowerCase())) ||
		(setId && COSMOS_SETS.has(setId.toLowerCase()));

	// Era routing: classic Rare Holo in a cosmos era → cosmos galaxy foil.
	if (eff === "rare holo" && inCosmosEra) {
		eff = "rare holo cosmos";
	}

	// Cosmos-era upgrade: a plain "Rare"/"Common"/"Uncommon" that carries a
	// HOLO printing (TCGdex marks POP + some vintage holos with the tier rarity,
	// not "Rare Holo", but flags the holo variant) is still a cosmos holo — the
	// rarity heuristic alone would leave it glare-only.
	if (eff === null && holo === true && inCosmosEra) {
		eff = "rare holo cosmos";
	}

	const number = cardNumber ?? "";
	// ptcg.io-shaped id — the alt-arts/promos tables and simey's TG promo list
	// are keyed on it (TCGdex renamed some sets and zero-pads numbers).
	const id = setId && cardNumber ? ptcgCardId(setId, cardNumber) : "";
	const subtypesLower = (subtypes ?? []).map((s) => s.toLowerCase());
	const isShiny = number.toLowerCase().startsWith("sv");
	const isGallery = /^[tg]g/i.test(number) || TG_PROMO_IDS.has(id);
	const isAlternate = ALT_ART_IDS.has(id) && !isShiny && !isGallery;
	const isPromo = setId?.toLowerCase() === "swshp";

	if (isGallery && eff) {
		if (eff.startsWith("trainer gallery")) {
			eff = eff.replace(/trainer gallery\s*/, "");
		}
		if (eff.includes("rare holo v") && subtypesLower.includes("vmax")) {
			eff = "rare holo vmax";
		}
		if (eff.includes("rare holo v") && subtypesLower.includes("vstar")) {
			eff = "rare holo vstar";
		}
	}

	if (isPromo) {
		if (TG_PROMO_IDS.has(id)) {
			eff = "rare secret";
		} else if (subtypesLower.includes("v")) {
			eff = "rare holo v";
		} else if (subtypesLower.includes("v-union")) {
			eff = "rare holo vunion";
		} else if (subtypesLower.includes("vmax")) {
			eff = "rare holo vmax";
		} else if (subtypesLower.includes("vstar")) {
			eff = "rare holo vstar";
		} else if (subtypesLower.includes("radiant")) {
			eff = "radiant rare";
		}
		const promoStyle = PROMO_STYLES[id];
		if (promoStyle) {
			const style = promoStyle.style.toLowerCase();
			if (style === "swholo") eff = "rare holo";
			else if (style === "cosmos") eff = "rare holo cosmos";
		}
	}

	// SV-era Black Star Promos (svp): every card is rarity "Promo", but the
	// physical treatments differ — ex promos carry the SV ex full-card etch
	// (our "rare holo v" family), everything else is a full-face mirror holo
	// (frame="fullface" via FULLFACE_FOIL_SETS un-clips the recipe).
	if (setId?.toLowerCase() === "svp" && subtypesLower.includes("ex")) {
		eff = "rare holo v";
	}

	if (isShiny) {
		if (eff === "rare shiny v" || eff === "rare holo v") eff = "rare shiny v";
		if (eff === "rare shiny vmax" || eff === "rare holo vmax") {
			eff = "rare shiny vmax";
		}
		// TCGdex flattens shiny V/VMAX to plain "Rare Shiny"; the subtype still
		// carries the frame (CardProxy saw ptcg's split rarities instead).
		if (eff === "rare shiny") {
			if (subtypesLower.includes("vmax")) eff = "rare shiny vmax";
			else if (subtypesLower.includes("v")) eff = "rare shiny v";
		}
	}

	if (isAlternate && subtypesLower.includes("vmax")) {
		eff = "rare rainbow alt";
	}

	// Known non-holo printing (TCGplayer variants say "normal", no holo). Only
	// the classic-holo families genuinely come in non-holo printings (basep-8
	// style promos, vintage dual prints) — premium families (V/ultra/shiny/…)
	// are ALWAYS physically foil, and TCGdex variant flags are noisy there
	// (shiny-vault + V promos arrive flagged "normal"). Applied AFTER the
	// pipeline so a promo remapped to a foil family keeps its foil.
	if (holo === false && (eff === null || DOWNGRADABLE_EFFECTIVE.has(eff))) {
		return {
			effectiveRarity: null,
			trainerGallery: isGallery,
			frame,
			className: "no-foil",
		};
	}

	return {
		effectiveRarity: eff,
		trainerGallery: isGallery,
		frame,
		className: effectiveToClass(eff),
	};
}

/** Foil families that also exist as genuine non-holo printings. */
const DOWNGRADABLE_EFFECTIVE: ReadonlySet<string> = new Set([
	"rare holo",
	"rare holo cosmos",
]);

/**
 * Back-compat shim for the old class-only API (tests, misc callers).
 * Prefer holoPresentation() — it also carries the data-rarity string.
 */
export function getHoloClass(
	rarity?: string,
	series?: string,
	holo?: boolean,
	setId?: string,
): string {
	return holoPresentation({ rarity, series, setId, holo }).className;
}
