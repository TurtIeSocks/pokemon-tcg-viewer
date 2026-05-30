// Build a wsrv.nl image-CDN URL that resizes + re-encodes to WebP on the fly.
// Free, no signup. `we` = "without enlargement" (never upscale past source).
const CDN = "https://wsrv.nl/";

export function cdnImage(
	rawUrl: string,
	opts: { w: number; dpr?: number },
): string {
	const params = new URLSearchParams({
		url: rawUrl,
		w: String(opts.w),
		output: "webp",
	});
	if (opts.dpr && opts.dpr > 1) params.set("dpr", String(opts.dpr));
	// `we` is a valueless flag; URLSearchParams can't emit a bare key, so append.
	return `${CDN}?${params.toString()}&we`;
}
