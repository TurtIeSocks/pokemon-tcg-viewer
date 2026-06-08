/** Converts a UTC epoch-ms timestamp to a YYYY-MM-DD string using local time. */
export function dayMsToInput(ms: number): string {
	const d = new Date(ms);
	const p = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Parses a YYYY-MM-DD string to a local-midnight epoch-ms value. */
export function inputDayToMs(s: string): number {
	const [y, m, d] = s.split("-").map(Number);
	return new Date(y, m - 1, d).getTime(); // local midnight
}
