import type { NumberReading } from "./scan-types";

// R2: OCR confusion map applied only inside numeric contexts.
const CONFUSIONS: Record<string, string> = {
	O: "0",
	o: "0",
	l: "1",
	I: "1",
	S: "5",
	s: "5",
	B: "8",
};
const deconfuse = (s: string) =>
	s.replace(/[OolISsB]/g, (c) => CONFUSIONS[c] ?? c);

/** Extract `{number,total}` from noisy number-strip OCR text (R2). */
export function parseNumberText(raw: string): NumberReading | null {
	const text = raw.trim();
	if (!text) return null;
	// Primary: N/T anywhere in the noise, after de-confusion.
	const frac = deconfuse(text).match(/(\d{1,3})\s*\/\s*(\d{1,3})/);
	if (frac) {
		return { number: String(Number(frac[1])), total: Number(frac[2]) };
	}
	// Promo ids: letters+digits token (e.g. SWSH123, SM210). No de-confusion:
	// the letter prefix is real. Require 2+ letters then 1+ digits.
	const promo = text.match(/\b([A-Z]{2,5}\d{1,3})\b/);
	if (promo) return { number: promo[1], total: null };
	return null;
}

/** Clean a name-strip OCR guess; null when nothing letter-like survives. */
export function parseNameText(raw: string): string | null {
	const cleaned = raw
		.replace(/[^\p{L}\p{N}''.\- ]/gu, " ")
		.replace(/\s+/g, " ")
		.trim();
	return /\p{L}{3}/u.test(cleaned) ? cleaned : null;
}
