// Incremental UI-string translation seed (Task 18). DISTINCT from
// scripts/build-i18n.ts, which builds CARD-data name overlays from TCGdex.
// This script maintains messages/{locale}.json (UI-chrome strings) after the
// initial 11-locale batch: when messages/en.json gains new keys, it fills
// ONLY the missing keys per locale via the Anthropic SDK, never clobbering an
// existing (human-reviewed) translation. `--force` regenerates every key.
//
// The Anthropic client is constructed lazily inside main(), guarded by
// `if (import.meta.main)`, so importing this module for the mergeTranslations
// unit tests never touches the network or requires ANTHROPIC_API_KEY.

import { readFileSync, writeFileSync } from "node:fs";
import {
	SUPPORTED_LANGUAGES,
	type SupportedLanguage,
} from "../src/lib/languages";

const MESSAGES_DIR = "messages";
const MODEL = "claude-opus-4-8";

/**
 * Merge freshly-translated keys over an existing locale file. In fill mode
 * (force=false) an existing key is NEVER overwritten -- fresh only backfills
 * keys missing from `existing`, so human review sticks. In force mode every
 * key fresh provides wins (full regenerate). Pure, no I/O.
 */
export function mergeTranslations(
	existing: Record<string, string>,
	fresh: Record<string, string>,
	force: boolean,
): Record<string, string> {
	if (force) return { ...existing, ...fresh };
	const out = { ...existing };
	for (const [k, v] of Object.entries(fresh)) {
		if (!(k in out)) out[k] = v;
	}
	return out;
}

/**
 * CLDR plural categories used by each non-English locale's structured plural
 * entries (the 8 `home_set_count`-shaped keys). The Latin locales distinguish
 * one/other; the CJK + Thai + Indonesian locales have no singular/plural
 * distinction and use only `other`. Mirrors the rule in translator-brief.md.
 */
const PLURAL_CATEGORIES: Record<
	Exclude<SupportedLanguage, "en">,
	readonly string[]
> = {
	fr: ["one", "other"],
	de: ["one", "other"],
	es: ["one", "other"],
	it: ["one", "other"],
	pt: ["one", "other"],
	ja: ["other"],
	ko: ["other"],
	"zh-tw": ["other"],
	"zh-cn": ["other"],
	th: ["other"],
	id: ["other"],
};

/** Keys whose value is a structured plural array, not a plain string (see translator-brief.md). */
const STRUCTURED_PLURAL_KEYS = [
	"home_set_count",
	"vault_bulk_add_to_binder_title",
	"vault_claim_local_cards",
	"vault_csv_import_button",
	"binder_rule_count",
	"binder_card_count",
	"binder_print_count_label",
	"binder_print_pages_of_paper",
];

function buildSystemPrompt(locale: SupportedLanguage): string {
	const categories =
		PLURAL_CATEGORIES[locale as Exclude<SupportedLanguage, "en">];
	return `You translate Pokemon TCG collection-app UI strings from English into ${locale}.

Hard requirements:
1. Return ONLY a valid JSON object mapping each input key to its translated value. No markdown fences, no commentary, no extra keys, no missing keys.
2. Preserve every interpolation placeholder literally: {name}, {count}, {label}, etc. Do NOT translate or rename them. They may move within the sentence as grammar requires, but the same set must appear in the output.
3. Valid JSON, UTF-8, double-quoted strings.
4. NO em-dashes (—) anywhere. Use periods, commas, or the target language's normal punctuation.
5. This is machine translation for later human review: aim for natural, correct, concise UI copy, not literal word-for-word.

Glossary -- LOCK these (do NOT translate, keep verbatim in the target text):
Brand/product names: Cardstack, Vault, Binder / Binders, Stack / Stacks, Pokémon (keep the é; in CJK you may keep "Pokémon" as-is since it's the brand).

Glossary -- LOCALIZE to the OFFICIAL Pokémon TCG regional term (do NOT leave English):
The Pokémon TCG has official translations for its card vocabulary in every supported locale. Use the OFFICIAL term, not a literal translation, for: Trainer (card supertype), Energy (card supertype), and Pokémon-type/category labels. Example (Japanese): Trainer -> トレーナー, Energy -> エネルギー, Pokémon (card category) -> ポケモン. Apply the equivalent official term for ${locale}. If unsure of the exact official term, use the most widely recognized standard translation used by the Pokémon TCG community in that language.

Structured plural entries -- CRITICAL:
Some input values are NOT plain strings but a structured plural array, shaped like:
[{"declarations": ["input count", "local countPlural = count: plural"], "selectors": ["countPlural"], "match": {"countPlural=one": "{count} set", "countPlural=other": "{count} sets"}}]
For these keys (${STRUCTURED_PLURAL_KEYS.join(", ")}):
- KEEP "declarations" and "selectors" EXACTLY as given (do not translate variable names like count, countPlural).
- In "match", provide ONLY these plural categories for ${locale}: ${categories.join(", ")}. Translate the string values. If the category list is just "other", include ONLY the "<selector>=other" key and drop any "=one" key.
- Preserve the placeholder (e.g. {count}) in every match value.
- Return the whole array structure for that key, not a plain string.

Return ONLY the JSON object, nothing else.`;
}

/** Compute which of en.json's keys are missing from a locale file (or all keys under force). */
function computeTargetKeys(
	en: Record<string, unknown>,
	localeExisting: Record<string, unknown>,
	force: boolean,
): string[] {
	const keys = Object.keys(en).filter((k) => k !== "$schema");
	if (force) return keys;
	return keys.filter((k) => !(k in localeExisting));
}

async function translateKeys(
	locale: SupportedLanguage,
	enSubset: Record<string, unknown>,
): Promise<Record<string, unknown>> {
	const { default: Anthropic } = await import("@anthropic-ai/sdk");
	const client = new Anthropic(); // ANTHROPIC_API_KEY from env
	const response = await client.messages.create({
		model: MODEL,
		max_tokens: 8192,
		system: buildSystemPrompt(locale),
		messages: [
			{
				role: "user",
				content: JSON.stringify(enSubset),
			},
		],
	});
	const text = response.content.find((b) => b.type === "text");
	if (!text || text.type !== "text") {
		throw new Error(`[${locale}] no text block in Anthropic response`);
	}
	// Strip accidental markdown fences, just in case.
	const raw = text.text
		.trim()
		.replace(/^```(?:json)?\n?/, "")
		.replace(/\n?```$/, "");
	return JSON.parse(raw) as Record<string, unknown>;
}

function readJson(path: string): Record<string, unknown> {
	return JSON.parse(readFileSync(path, "utf8"));
}

function readLocaleFileOrEmpty(
	locale: SupportedLanguage,
): Record<string, unknown> {
	try {
		return readJson(`${MESSAGES_DIR}/${locale}.json`);
	} catch {
		return {};
	}
}

export async function main(): Promise<void> {
	if (!process.env.ANTHROPIC_API_KEY) {
		console.error(
			"seed-ui-translations: ANTHROPIC_API_KEY is not set. Export it before running this script.",
		);
		process.exitCode = 1;
		return;
	}

	const force = process.argv.includes("--force");
	const en = readJson(`${MESSAGES_DIR}/en.json`);
	const schema = en.$schema as string | undefined;

	for (const locale of SUPPORTED_LANGUAGES) {
		if (locale === "en") continue;
		const existing = readLocaleFileOrEmpty(locale);
		const targetKeys = computeTargetKeys(en, existing, force);
		if (targetKeys.length === 0) {
			console.log(`[${locale}] up to date, nothing to translate`);
			continue;
		}

		const enSubset: Record<string, unknown> = {};
		for (const k of targetKeys) enSubset[k] = en[k];

		console.log(`[${locale}] translating ${targetKeys.length} key(s)...`);
		try {
			const fresh = await translateKeys(locale, enSubset);
			const merged = mergeTranslations(
				existing as Record<string, string>,
				fresh as Record<string, string>,
				force,
			);
			if (schema) merged.$schema = schema;
			writeFileSync(
				`${MESSAGES_DIR}/${locale}.json`,
				`${JSON.stringify(merged, null, "\t")}\n`,
			);
			console.log(`[${locale}] wrote ${Object.keys(merged).length} keys`);
		} catch (e) {
			console.error(`[${locale}] translation failed: ${(e as Error).message}`);
		}
	}
}

if (import.meta.main) {
	await main();
}
