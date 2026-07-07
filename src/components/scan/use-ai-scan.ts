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

export interface UseAiScanResult {
	/** POST the JPEG (base64, no data-URL prefix) and resolve ranked matches. */
	run(frameJpegBase64: string): Promise<ScanCandidate[]>;
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
		async (frameJpegBase64: string): Promise<ScanCandidate[]> => {
			setState("loading");
			try {
				const res = await fetch("/api/scan", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ imageBase64: frameJpegBase64 }),
				});

				if (res.status === 401) {
					setState("unauthorized");
					return [];
				}
				if (res.status === 403) {
					setState("needs_plus");
					return [];
				}
				if (!res.ok) {
					setState("error");
					return [];
				}

				const result = (await res.json()) as AiScanResultBody;
				setState("idle");
				if (!index) return [];
				return matchScan(
					{
						reading: { number: result.number, total: result.setTotal },
						nameText: result.name,
					},
					index.cards,
					sets ?? [],
				);
			} catch {
				setState("error");
				return [];
			}
		},
		[index, sets],
	);

	return { run, state };
}
