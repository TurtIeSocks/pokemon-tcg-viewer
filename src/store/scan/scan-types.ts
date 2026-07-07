/** R2: what the number-strip OCR yields. total null = promo-style id. */
export interface NumberReading {
	number: string;
	total: number | null;
}

/** One candidate the matcher returns; score in [0,1]. */
export interface ScanCandidate {
	cardId: string;
	score: number;
}
