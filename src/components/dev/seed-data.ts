// src/components/dev/seed-data.ts
//
// Pure RNG generators for the dev-only "RNG Machine" (preview-login panel).
// Imported solely by preview-login.tsx, which is gated on VITE_CLAUDE_PREVIEW,
// so Vite drops this whole module from production bundles. The RNG and clock are
// injected so the generators are deterministic under test.

import type { SupportedLanguage } from "@/lib/languages";
import type { CorpusCard } from "@/store/corpus/corpus-types";
import type {
	CardCondition,
	CardGrading,
	NewStack,
	SerializedQuery,
} from "@/store/userland/types";

/** A `Math.random`-shaped source of randomness (injectable for tests). */
export type Rng = () => number;

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Integer in [min, max] inclusive. */
function int(min: number, max: number, rng: Rng): number {
	return Math.floor(rng() * (max - min + 1)) + min;
}

function pick<T>(arr: readonly T[], rng: Rng): T {
	return arr[Math.floor(rng() * arr.length)];
}

function chance(p: number, rng: Rng): boolean {
	return rng() < p;
}

/** Weighted pick: entries are `[value, weight]`; weights need not sum to 1. */
function weighted<T>(entries: readonly (readonly [T, number])[], rng: Rng): T {
	const total = entries.reduce((s, [, w]) => s + w, 0);
	let r = rng() * total;
	for (const [value, w] of entries) {
		r -= w;
		if (r < 0) return value;
	}
	return entries[entries.length - 1][0];
}

/** Distinct sample of up to `n` items (partial Fisher–Yates; non-mutating). */
function sample<T>(arr: readonly T[], n: number, rng: Rng): T[] {
	const pool = arr.slice();
	const k = Math.min(Math.max(0, n), pool.length);
	for (let i = 0; i < k; i++) {
		const j = i + Math.floor(rng() * (pool.length - i));
		[pool[i], pool[j]] = [pool[j], pool[i]];
	}
	return pool.slice(0, k);
}

// ---------------------------------------------------------------------------
// Distributions / vocab
// ---------------------------------------------------------------------------

const CONDITIONS: readonly (readonly [CardCondition, number])[] = [
	["NM", 50],
	["LP", 25],
	["MP", 13],
	["HP", 8],
	["DMG", 4],
];
const QUANTITIES: readonly (readonly [number, number])[] = [
	[1, 60],
	[2, 20],
	[3, 12],
	[4, 8],
];
// Keys are typed to the catalog-supported set so this can't drift back to
// weighting an unsupported language (the old ja/zh seed bug).
const LANGUAGES: readonly (readonly [SupportedLanguage, number])[] = [
	["en", 70],
	["fr", 8],
	["de", 7],
	["es", 6],
	["it", 5],
	["pt", 4],
];
const GRADERS = ["PSA", "CGC", "BGS"] as const;
const GRADES = [8, 9, 9.5, 10] as const;
const SOURCES = [
	"eBay",
	"TCGplayer",
	"Local card shop",
	"Trade",
	"Pulled it",
] as const;
const STORAGE = [
	"Binder A",
	"Box 1",
	"Deck box",
	"Safe",
	"Toploader stack",
] as const;
const NOTES = [
	"Centering off",
	"Sun-faded back",
	"Childhood pull",
	"Earmarked for trade",
	"Possible misprint",
] as const;

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Stacks
// ---------------------------------------------------------------------------

/** One random stack for `card`. */
function stackFor(card: CorpusCard, now: number, rng: Rng): NewStack {
	const graded = chance(0.15, rng);
	// A graded slab carries no raw condition; an ungraded card has no grading.
	const grading: CardGrading | null = graded
		? {
				company: pick(GRADERS, rng),
				grade: pick(GRADES, rng),
				cert: String(int(10_000_000, 99_999_999, rng)),
			}
		: null;
	const variants = card.variants ?? [];
	return {
		cardId: card.id,
		// One stack per distinct card → it is that card's primary copy.
		isPrimary: true,
		quantity: weighted(QUANTITIES, rng),
		condition: graded ? null : weighted(CONDITIONS, rng),
		grading,
		// Per-unit price in MINOR units (cents); sometimes unknown (null ≠ free).
		pricePaid: chance(0.8, rng) ? int(25, 30_000, rng) : null,
		currency: "USD",
		language: weighted(LANGUAGES, rng),
		variant: variants.length > 0 ? pick(variants, rng) : null,
		acquiredAt: now - int(0, 730, rng) * DAY_MS,
		source: chance(0.4, rng) ? pick(SOURCES, rng) : null,
		storageLocation: chance(0.3, rng) ? pick(STORAGE, rng) : null,
		notes: chance(0.15, rng) ? pick(NOTES, rng) : null,
		label: null,
	};
}

/** Generate `count` random stacks across distinct corpus cards. */
export function generateSeedStacks(
	cards: readonly CorpusCard[],
	count: number,
	now: number,
	rng: Rng = Math.random,
): NewStack[] {
	return sample(cards, count, rng).map((c) => stackFor(c, now, rng));
}

// ---------------------------------------------------------------------------
// Binders
// ---------------------------------------------------------------------------

const BINDER_NAMES = [
	"Trade Binder",
	"Shiny Hunt",
	"Charizard Vault",
	"Holo Heaven",
	"Slab City",
	"Bulk Bin",
	"Wishlist",
	"Grails",
	"Vintage Picks",
	"Rainbow Rares",
	"Eevee Squad",
	"PSA 10 Club",
	"Energy Stash",
	"Starter Decks",
	"Misprints",
] as const;

const BINDER_BLURBS: readonly (string | null)[] = [
	"Auto-seeded by the RNG machine.",
	null,
	"Work in progress.",
	"Faves only.",
];

/** A plan the UI turns into a binder: a smart rule (by set) OR manual members. */
export interface SeedBinderPlan {
	name: string;
	description: string | null;
	/** Smart-rule membership (by set); null for a manual binder. */
	query: SerializedQuery | null;
	/** Manual member cardIds (used when `query` is null). */
	cardIds: string[];
}

/** A query that matches every card in one set (all other facets unset). */
function bySetQuery(setId: string): SerializedQuery {
	return {
		text: null,
		setId,
		dexNumber: null,
		types: [],
		rarities: [],
		supertypes: [],
		subtypes: [],
		yearMin: null,
		yearMax: null,
		mode: "fuzzy",
	};
}

/**
 * Generate `count` binders with distinct names. Roughly half get a smart "by
 * set" rule (keyed on a random corpus card's set); the rest are manual binders
 * holding a random handful of the owned cards.
 */
export function generateSeedBinders(
	ownedCardIds: readonly string[],
	cards: readonly CorpusCard[],
	count: number,
	rng: Rng = Math.random,
): SeedBinderPlan[] {
	return sample(BINDER_NAMES, count, rng).map((name) => {
		const description = pick(BINDER_BLURBS, rng);
		if (cards.length > 0 && chance(0.5, rng)) {
			return {
				name,
				description,
				query: bySetQuery(pick(cards, rng).setId),
				cardIds: [],
			};
		}
		const k =
			ownedCardIds.length === 0
				? 0
				: int(1, Math.min(8, ownedCardIds.length), rng);
		return {
			name,
			description,
			query: null,
			cardIds: sample(ownedCardIds, k, rng),
		};
	});
}
