/**
 * Free-text search grammar for the `q=` box. Pure, shared (client + server),
 * never throws. Parses a raw string into a name expression (OR of arms, each an
 * AND of positive/negated/literal terms) plus a set of structured field filters
 * (`type:`, `rarity:`, …) extracted globally.
 *
 * Back-compat contract: a query with NO operators (`,` `+` `!` `"` or a known
 * `field:`) parses to a single arm holding a single positive, non-literal term
 * whose text is the trimmed raw string. Downstream that runs the existing
 * contiguous `matchName`, so plain queries behave EXACTLY as before.
 */

/** One leaf of the name expression. */
export interface NameTerm {
	/** Raw term text, pre-normalization; spaces preserved (contiguous match). */
	text: string;
	/** Leading `!` → the card name must NOT match this term. */
	negated: boolean;
	/** Came from a `"…"` quoted literal (operator chars inside were literal). */
	literal: boolean;
}

/** A conjunction: ALL positive terms must match, ALL negated must not. */
export interface NameArm {
	terms: NameTerm[];
}

/** A disjunction of arms. Empty `arms` → no name filter (matches every card). */
export interface NameExpr {
	arms: NameArm[];
}

/**
 * Field filters pulled out of the query, shaped as the partial facet set that
 * merges into a CorpusQuery. Values are verbatim (trimmed) — the engine matches
 * them case-insensitively against the corpus vocabulary.
 */
export interface FieldFilters {
	types?: string[];
	rarities?: string[];
	supertypes?: string[];
	subtypes?: string[];
	setId?: string;
	dexNumbers?: number[];
	yearMin?: number;
	yearMax?: number;
}

export interface ParsedQuery {
	name: NameExpr;
	fields: FieldFilters;
}

/** Which FieldFilters key each accepted `field:` prefix targets. */
type ArrayField = "types" | "rarities" | "supertypes" | "subtypes";
type FieldTarget = ArrayField | "setId" | "year";

const FIELD_ALIASES: Record<string, FieldTarget> = {
	type: "types",
	types: "types",
	rarity: "rarities",
	rarities: "rarities",
	supertype: "supertypes",
	supertypes: "supertypes",
	subtype: "subtypes",
	subtypes: "subtypes",
	set: "setId",
	sets: "setId",
	year: "year",
	years: "year",
};

const isSpace = (c: string): boolean => c === " " || c === "\t" || c === "\n";
/** Chars that end a run (top level): whitespace and the two structural ops. */
const isBoundary = (c: string): boolean => isSpace(c) || c === "," || c === "+";

/** Case-insensitive de-dup, first occurrence wins. */
function pushUnique(arr: string[], value: string): void {
	const lower = value.toLowerCase();
	if (!arr.some((v) => v.toLowerCase() === lower)) arr.push(value);
}

/** Apply one extracted `field:value` token into the accumulating filters. */
function applyField(
	fields: FieldFilters,
	target: FieldTarget,
	rawValue: string,
) {
	if (target === "year") {
		// Take the first comma-segment; support `1999` or `1999-2001`.
		const spec = rawValue.split(",")[0]?.trim() ?? "";
		const m = /^(\d{1,4})(?:\s*-\s*(\d{1,4}))?$/.exec(spec);
		if (!m) return;
		const a = Number(m[1]);
		const b = m[2] != null ? Number(m[2]) : a;
		const lo = Math.min(a, b);
		const hi = Math.max(a, b);
		// Repeated year ops intersect (AND) — the tighter bound wins.
		fields.yearMin = fields.yearMin == null ? lo : Math.max(fields.yearMin, lo);
		fields.yearMax = fields.yearMax == null ? hi : Math.min(fields.yearMax, hi);
		return;
	}
	if (target === "setId") {
		// Singular dimension: first non-empty value wins (the engine scopes to one).
		const first = rawValue.split(",")[0]?.trim();
		if (first && fields.setId == null) fields.setId = first;
		return;
	}
	let arr = fields[target];
	if (!arr) {
		arr = [];
		fields[target] = arr;
	}
	for (const part of rawValue.split(",")) {
		const v = part.trim();
		if (v) pushUnique(arr, v);
	}
}

/**
 * Global pass 1: scan `raw`, extracting every `knownfield:value` token (outside
 * quotes) into `fields`, and returning the leftover "name residue" (field ops
 * replaced by a space so neighbours stay separated).
 */
function extractFields(raw: string): { residue: string; fields: FieldFilters } {
	const fields: FieldFilters = {};
	let residue = "";
	let inQuotes = false;
	let i = 0;
	while (i < raw.length) {
		const ch = raw[i];
		if (ch === '"') {
			inQuotes = !inQuotes;
			residue += ch;
			i++;
			continue;
		}
		const atWordStart =
			!inQuotes && (i === 0 || isBoundary(raw[i - 1]) || raw[i - 1] === '"');
		if (atWordStart) {
			const op = matchFieldOpAt(raw, i);
			if (op) {
				applyField(fields, op.target, op.value);
				residue += " ";
				i = op.end;
				continue;
			}
		}
		residue += ch;
		i++;
	}
	return { residue, fields };
}

/** Try to read a `field:value` token starting at `i`. Returns null if none. */
function matchFieldOpAt(
	raw: string,
	i: number,
): { target: FieldTarget; value: string; end: number } | null {
	let j = i;
	while (j < raw.length && /[a-zA-Z]/.test(raw[j])) j++;
	if (raw[j] !== ":" || j === i) return null;
	const target = FIELD_ALIASES[raw.slice(i, j).toLowerCase()];
	if (!target) return null;
	// Value runs from after ':' until whitespace or '+' (both outside quotes).
	// Commas are kept (they mean OR within the field).
	let k = j + 1;
	let valueInQuotes = false;
	let value = "";
	while (k < raw.length) {
		const c = raw[k];
		if (c === '"') {
			valueInQuotes = !valueInQuotes;
			k++;
			continue;
		}
		if (!valueInQuotes && (isSpace(c) || c === "+")) break;
		value += c;
		k++;
	}
	if (value.trim() === "") return null; // `type:` with no value → treat as text
	return { target, value, end: k };
}

/**
 * Split `s` at top-level occurrences of `sep` (outside quotes). Quote chars are
 * kept in the pieces so the term builder can detect literals. An unclosed quote
 * simply extends to end-of-string.
 */
function splitTopLevel(s: string, sep: "," | "+"): string[] {
	const out: string[] = [];
	let cur = "";
	let inQuotes = false;
	for (const c of s) {
		if (c === '"') inQuotes = !inQuotes;
		if (c === sep && !inQuotes) {
			out.push(cur);
			cur = "";
			continue;
		}
		cur += c;
	}
	out.push(cur);
	return out;
}

/** Build a NameTerm from one raw term slice, or null if it's empty/degenerate. */
function buildTerm(raw: string): NameTerm | null {
	let s = raw.trim();
	let negated = false;
	if (s.startsWith("!")) {
		negated = true;
		s = s.slice(1).trim();
	}
	if (s === "") return null; // lone `!`, trailing `+`, empty slice → drop
	// Literal if any quote is present; strip the quote chars, keep inner text.
	const literal = s.includes('"');
	const text = literal ? s.replace(/"/g, "") : s;
	if (text.trim() === "") return null;
	return { text, negated, literal };
}

/** Parse the field-stripped residue into the OR/AND/NOT name expression. */
function parseName(residue: string): NameExpr {
	const arms: NameArm[] = [];
	for (const armRaw of splitTopLevel(residue, ",")) {
		const terms: NameTerm[] = [];
		for (const termRaw of splitTopLevel(armRaw, "+")) {
			const term = buildTerm(termRaw);
			if (term) terms.push(term);
		}
		if (terms.length) arms.push({ terms });
	}
	return { arms };
}

/** Fallback: the whole raw string as one positive, contiguous term (today). */
function wholeStringExpr(raw: string): NameExpr {
	const text = raw.trim();
	return text
		? { arms: [{ terms: [{ text, negated: false, literal: false }] }] }
		: { arms: [] };
}

/**
 * Parse a raw `q=` string into a name expression + field filters. Never throws:
 * any unexpected failure falls back to treating the raw string as one
 * contiguous term (today's behavior).
 */
export function parseSearchQuery(raw: string): ParsedQuery {
	if (!raw || raw.trim() === "") return { name: { arms: [] }, fields: {} };
	try {
		const { residue, fields } = extractFields(raw);
		return { name: parseName(residue), fields };
	} catch {
		return { name: wholeStringExpr(raw), fields: {} };
	}
}
