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
 */
export const DP_FRAME_SERIES: ReadonlySet<string> = new Set([
	"diamond & pearl",
	"platinum",
]);

/**
 * HGSS era series (HeartGold & SoulSilver, the JP LEGEND line, and Call of
 * Legends — same-era frame, verified off col1-1): the DP layout but with a
 * TALLER art window (its bottom sits ~2% lower). Own knob set via
 * data-frame="hgss" (rarity-styles.css). Lowercased TCGdex `serie.name`
 * strings. USER-EDITABLE.
 */
export const HGSS_FRAME_SERIES: ReadonlySet<string> = new Set([
	"heartgold & soulsilver",
	"legend", // JP L series — HGSS era
	"call of legends", // shares the HGSS window
]);

/**
 * Black & White era series: the DP-style plain window (stage badge sits to
 * the LEFT, outside the art — no notch), but the SHORTEST of the trio (its
 * bottom sits a touch higher than DP/HGSS). Own knob set via
 * data-frame="bw" (rarity-styles.css). Lowercased TCGdex `serie.name`
 * strings. USER-EDITABLE.
 */
export const BW_FRAME_SERIES: ReadonlySet<string> = new Set(["black & white"]);

/**
 * XY era series (2013-2016): the art-window Pokémon holos sit in their OWN
 * window (measured off xy1 — a touch taller than BW, bottom ~49%), so they get
 * data-frame="xy" with tunable knobs rather than simey's generic default clip.
 * The stage badge overlaps the window's top-left corner (notch, like BW). The
 * full-art premium cards are handled separately (see XY_FULLART_RARITIES).
 * Lowercased TCGdex `serie.name` strings. USER-EDITABLE.
 */
export const XY_FRAME_SERIES: ReadonlySet<string> = new Set(["xy", "xy break"]);

/**
 * XY-era rarities whose cards are FULL-ART (foil covers the whole face): EX /
 * Mega EX (Rare Holo EX, Rare Ultra), the gold/rainbow secrets (Rare Secret),
 * and the rotated gold BREAK cards (Rare BREAK). XY has no CDN foil masks
 * (buildFoilUrls only serves SWSH/SV/PGO), so these route to frame="fullface"
 * plus a procedural simey recipe matched to the physical foil: EX/Mega get the
 * sunpillar etch ("rare holo v"), secrets + BREAK the gold-glitter geometric
 * foil ("rare secret") — both recipes carry :not(.masked) fallbacks, so they
 * render fully without CDN assets. Lowercased raw rarities. USER-EDITABLE.
 */
export const XY_FULLART_RARITIES: ReadonlySet<string> = new Set([
	"rare holo ex",
	"rare ultra",
	"rare secret",
	"rare break",
]);

/**
 * Sun & Moon era series (2017-2019): the art-window Pokémon holos get their
 * own window via data-frame="sm" (measured off sm1 — sides wider than simey's
 * generic default, 6.5-93.5% vs 8-92%). Stage badge notches the top-left like
 * XY/BW. Full-art premium cards route to fullface via SM_FULLART_RARITIES.
 * Lowercased TCGdex `serie.name` strings. USER-EDITABLE.
 */
export const SM_FRAME_SERIES: ReadonlySet<string> = new Set(["sun & moon"]);

/**
 * SM-era rarities whose cards are foiled across the WHOLE face, so no clip
 * window: regular GX (etched full-face → "rare holo v" via the rarity table),
 * full-art GX/trainers (Rare Ultra), rainbows, gold secrets, Prism Star
 * (full-face dark holo → "rare ultra" via the table), and the Hidden Fates
 * shiny vault (sma — sparkle covers the full white card). All the target
 * recipes carry :not(.masked) procedural fallbacks. Lowercased raw rarities.
 * USER-EDITABLE.
 */
export const SM_FULLART_RARITIES: ReadonlySet<string> = new Set([
	"rare holo gx",
	"rare ultra",
	"rare rainbow",
	"rare secret",
	"rare prism star",
	"rare shiny",
	"rare shiny gx",
]);

/**
 * Mega Evolution block series (2025-2026, Scarlet & Violet-generation template):
 * the Western "Mega Evolution" serie and its JP counterpart. Its "Rare Holo EX"
 * Mega ex cards are full-face sheen foils, but they reach the procedural path
 * with no CDN mask (buildFoilUrls serves only swsh/sv/pgo) and no cosmos/frame
 * era, so they'd fall to the art-window "rare holo" default — the me05 bug. This
 * set routes them to the full-face V sheen. Lowercased series strings (pokemon
 * TCG `series` for the west, TCGdex `serie.name` for the asian region).
 * USER-EDITABLE.
 */
export const MEGA_EVOLUTION_SERIES: ReadonlySet<string> = new Set([
	"mega evolution",
	"ポケモンカードゲーム mega", // asian-region serie name (TCGdex ja)
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
	"54a", // Mewtwo EX (BW full-art)
	"60a", // Tapu Lele GX (SM full-art)
	"76a", // M Rayquaza EX (XY Mega full-art)
	"97a", // Xerneas EX (XY full-art)
	"107a", // Donphan Prime (HGSS full-bleed)
	"109a", // Luxray GL LV.X (DP full-art)
	"113a", // Reshiram (BW full-art)
	"114a", // Zekrom (BW full-art)
	"145a", // Garchomp C LV.X (DP full-art)
]);

/**
 * Classic Collection reprints of EX-era (2003-2007) cards: their art window +
 * bottom-left stage badge match the EX frame, not the WotC vintage window they
 * would otherwise default to. Lowercased card numbers. USER-EDITABLE.
 */
export const CLASSIC_EX_NUMBERS: ReadonlySet<string> = new Set([
	"9a", // Team Magma's Groudon
	"17a", // Umbreon ☆ (Gold Star, POP5)
	"86a", // Rocket's Admin. (trainer)
	"88a", // Mew ex
	"93a", // Gardevoir ex
]);

/** Frame treatment for the procedural clip windows (data-frame attribute). */
export type HoloFrame =
	| "vintage"
	| "ecard"
	| "ex"
	| "dp"
	| "hgss"
	| "bw"
	| "xy"
	| "sm"
	| "fullface"
	| null;

function frameFor(
	series?: string,
	setId?: string,
	rarity?: string,
	cardNumber?: string,
): HoloFrame {
	const rarityLower = (rarity ?? "").toLowerCase();
	// Black White Rare (the 2 Black Bolt / White Flare chase ex full-arts) are
	// full-bleed etched cards — foil the whole face, no art window. Keyed on the
	// rarity, not the set (the set is otherwise a normal masked SV set).
	if (rarityLower === "black white rare") return "fullface";
	// Pokémon LEGEND cards (HGSS era; each is a 2-card top/bottom assembly) are
	// full-bleed holos — the whole illustration is foil, not an art window. They
	// live in the HGSS sets, so without this they'd take the hgss art-window clip.
	if (rarityLower === "legend" || rarityLower === "rare holo legend")
		return "fullface";
	const sid = setId?.toLowerCase();
	if (sid && FULLFACE_FOIL_SETS.has(sid)) {
		// Classic Collection reprints keep their original frame's window;
		// the main-set cards are mirror-foiled face-wide.
		if (rarity?.toLowerCase() === "classic collection") {
			// Cross-era anthology: full-bleed cards → fullface, EX-era cards → the
			// EX window, everything else → the WotC vintage window.
			const num = (cardNumber ?? "").toLowerCase();
			if (CLASSIC_FULLFACE_NUMBERS.has(num)) return "fullface";
			if (CLASSIC_EX_NUMBERS.has(num)) return "ex";
			return "vintage";
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
	if (ser && HGSS_FRAME_SERIES.has(ser)) return "hgss";
	if (ser && BW_FRAME_SERIES.has(ser)) return "bw";
	if (ser && XY_FRAME_SERIES.has(ser)) {
		// Full-art premium cards (EX / Mega / secret / BREAK) foil the whole face;
		// the rest are art-window Pokémon holos.
		return XY_FULLART_RARITIES.has((rarity ?? "").toLowerCase())
			? "fullface"
			: "xy";
	}
	if (ser && SM_FRAME_SERIES.has(ser)) {
		// Same split as XY: GX / full-arts / prisms / shiny vault foil the whole
		// face; the rest are art-window Pokémon holos.
		return SM_FULLART_RARITIES.has((rarity ?? "").toLowerCase())
			? "fullface"
			: "sm";
	}
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

	// XY full-art premium cards (frame="fullface" from frameFor) have no CDN
	// mask, but the simey recipes carry :not(.masked) procedural fallbacks —
	// route each card class to its authentic foil character: EX/Mega (Rare Holo
	// EX / Rare Ultra) get the sunpillar etch ("rare holo v"), and the gold
	// cards (Rare Secret + the gold-framed Rare BREAK) get the gold-glitter
	// geometric foil ("rare secret"). This also revives Rare BREAK (rarity not
	// /holo/, printing "normal"-only) which would otherwise flatten below — so
	// it must skip the downgrade too.
	const rarityLower = (rarity ?? "").toLowerCase();
	const isXyFullArt =
		frame === "fullface" && XY_FULLART_RARITIES.has(rarityLower);
	if (isXyFullArt) {
		eff =
			rarityLower === "rare secret" || rarityLower === "rare break"
				? "rare secret"
				: "rare holo v";
	}

	// Mega Evolution era (2025-2026, e.g. me05 Pitch Black): its "Rare Holo EX"
	// Mega ex cards are full-face sheen foils (S&V template) but reach the
	// procedural path with frame=null — no CDN mask, not a cosmos era, no frame
	// series — so without this they fall to the art-window "rare holo" default
	// (holo-basic): the reported bug. Route them to the full-face V sheen; the
	// "rare holo v" recipe is full-face regardless of frame, so frame stays null.
	// Scoped to the Mega Evolution series so the vintage 2003-07 cosmos ex and the
	// BW-era ex keep their current rendering (a full-face-cosmos correction for
	// those is a separate, documented follow-up).
	if (
		rarityLower === "rare holo ex" &&
		MEGA_EVOLUTION_SERIES.has((series ?? "").toLowerCase())
	) {
		eff = "rare holo v";
	}

	// Known non-holo printing (TCGplayer variants say "normal", no holo). Only
	// the classic-holo families genuinely come in non-holo printings (basep-8
	// style promos, vintage dual prints) — premium families (V/ultra/shiny/…)
	// are ALWAYS physically foil, and TCGdex variant flags are noisy there
	// (shiny-vault + V promos arrive flagged "normal"). Applied AFTER the
	// pipeline so a promo remapped to a foil family keeps its foil.
	//
	// NEVER downgrade a card whose RARITY itself says holo ("Rare Holo",
	// "Holo Rare", …). That rarity is ground truth; the "normal"-only variant
	// list is a TCGdex data gap (whole sets like Call of Legends list no holo
	// printing at all), not a real non-holo printing. The downgrade is only
	// for non-committal rarities (Promo / Rare / None) that we UPGRADED into a
	// foil family — where the printing is the tie-breaker.
	const rarityIsExplicitHolo = /holo/i.test(rarity ?? "");
	if (
		holo === false &&
		!rarityIsExplicitHolo &&
		!isXyFullArt &&
		(eff === null || DOWNGRADABLE_EFFECTIVE.has(eff))
	) {
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
