import type { NumberReading } from "./scan-types";

interface Tally {
	key: string;
	count: number;
	reading: NumberReading;
}

/**
 * R3: multi-frame voting makes cheap OCR reliable. OCR runs every ~500ms;
 * a single-frame reading is never trusted. A reading becomes confident once
 * `agreeCount` consecutive-compatible readings agree; a conflicting reading
 * (card swapped) restarts the tally on the new value. `null` readings (no
 * text detected this frame) neither advance nor reset the tally, so a
 * momentary miss doesn't throw away progress toward consensus.
 */
export function createVoter(agreeCount = 2) {
	let tally: Tally | null = null;

	function push(reading: NumberReading | null): NumberReading | null {
		if (reading === null) {
			return null;
		}

		const key = `${reading.number}/${reading.total}`;

		if (tally && tally.key === key) {
			tally.count += 1;
			tally.reading = reading;
		} else {
			tally = { key, count: 1, reading };
		}

		return tally.count >= agreeCount ? tally.reading : null;
	}

	function reset(): void {
		tally = null;
	}

	return { push, reset };
}
