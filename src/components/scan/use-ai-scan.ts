// use-ai-scan.ts
//
// Client hook for the Plus-gated AI vision scan (R6, R7). POSTs one guide-
// cropped JPEG (base64) to `/api/scan` and maps the vision result through
// `matchScan` against the in-memory corpus, mirroring `scan-view.tsx`'s own
// device-OCR match call. Reads `index`/`sets` itself (the actual consumer of
// that data), per the zustand-subscription-patterns skill's S3 rule: a
// selector only isolates a render when it lives in the component/hook that
// uses the value, not when the value is drilled in from a caller.

import { useCallback, useState } from "react";
import { useStore } from "../../store";
import { useCorpusRuntime } from "../../store/corpus/corpus-runtime-store";
import { matchScan } from "../../store/scan/match";
import type { ScanCandidate } from "../../store/scan/scan-types";
import { setsForRegion } from "../../store/sets-slice";

export type AiScanState =
	| "idle"
	| "loading"
	| "error"
	| "unauthorized"
	| "needs_plus";

/**
 * Discriminated result returned directly from `run()`. Callers MUST branch on
 * this return value, not on `state` read after the `await` -- `state` is
 * exposed purely so the button can re-render (Plus chip / spinner text)
 * across renders, and reading it post-await is a stale closure: if the user
 * retries quickly, a second call's `setState` can land between the first
 * call's `await` and its own post-await read of `state`, silently discarding
 * a successful retry. See scan-view.tsx handleAiScan.
 */
export type AiRunResult =
	| { state: "ok"; candidates: ScanCandidate[] }
	| { state: "unauthorized" | "needs_plus" | "error" };

export interface UseAiScanResult {
	/** POST the JPEG (base64, no data-URL prefix); resolves the discriminated result. */
	run(frameJpegBase64: string): Promise<AiRunResult>;
	state: AiScanState;
}

interface AiScanResultBody {
	name: string;
	number: string;
	setTotal: number | null;
	language: string;
	confidence: number;
}

/** R6/R7: Plus AI scan. One server-proxied vision call, mapped through matchScan. */
export function useAiScan(): UseAiScanResult {
	const [state, setState] = useState<AiScanState>("idle");
	const index = useCorpusRuntime((s) => s.index);
	const activeRegion = useCorpusRuntime((s) => s.activeRegion);
	const sets = useStore((s) => setsForRegion(s, activeRegion));

	const run = useCallback(
		async (frameJpegBase64: string): Promise<AiRunResult> => {
			setState("loading");
			try {
				const res = await fetch("/api/scan", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ imageBase64: frameJpegBase64 }),
				});

				if (res.status === 401) {
					setState("unauthorized");
					return { state: "unauthorized" };
				}
				if (res.status === 403) {
					setState("needs_plus");
					return { state: "needs_plus" };
				}
				if (!res.ok) {
					setState("error");
					return { state: "error" };
				}

				const result = (await res.json()) as AiScanResultBody;
				setState("idle");
				// R2/R6: empty/whitespace `number` means the vision model found no
				// printed collector number (e.g. glare, sticker, odd promo) --
				// treat it the same as no reading at all so matchScan falls back to
				// name-only fuzzy instead of keying off an empty string.
				const trimmedNumber = result.number.trim();
				const reading =
					trimmedNumber.length > 0
						? { number: trimmedNumber, total: result.setTotal }
						: null;
				const candidates = index
					? matchScan(
							{ reading, nameText: result.name },
							index.cards,
							sets ?? [],
						)
					: [];
				return { state: "ok", candidates };
			} catch {
				setState("error");
				return { state: "error" };
			}
		},
		[index, sets],
	);

	return { run, state };
}
