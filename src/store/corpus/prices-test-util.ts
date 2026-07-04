// Shared test fixtures for the price-blob runtime. gzBlob was previously
// copy-pasted verbatim across prices-runtime.test.ts, prices-runtime-hooks.test.tsx,
// and card-prices.test.tsx — extracted here so the gzip-encoding logic and the
// baseline priced-card fixture live in one place.
import { gzipSync } from "node:zlib";
import type { PricesBlob } from "@/lib/corpus/price-types";

/** Gzip-encode a PricesBlob into the ArrayBuffer shape `fetchBlob` returns. */
export function gzBlob(blob: PricesBlob): ArrayBuffer {
	const buf = gzipSync(Buffer.from(JSON.stringify(blob)));
	return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

/** A single priced card (base1-4), tcgplayer Holofoil + cardmarket, EUR-based fx. */
export const PRICES_BLOB_FIXTURE: PricesBlob = {
	v: 1,
	date: "2026-07-03",
	fx: { base: "EUR", date: "2026-07-03", rates: { USD: 1.09 } },
	sources: { tp: "2026-07-03", cm: "2026-07-03" },
	cards: {
		"base1-4": { tp: { H: [72034, 53499] }, cm: [50168, 27674, 40096, 56391] },
	},
};
