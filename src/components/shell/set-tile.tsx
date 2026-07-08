import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { LIST_SEARCH_DEFAULTS } from "../../lib/list-search";
import type { NavSet } from "../../lib/nav-tree";
import { ProgressRing } from "../ui/progress-ring";

/**
 * Coerce a blank/nullish asset url to `undefined` so React omits the `src`
 * attribute. An empty `src=""` re-fetches the whole page (HTML spec → flash);
 * older TCGdex data carries `""` for missing logos/symbols.
 */
function nonEmptyUrl(url: string | null | undefined): string | undefined {
	return url ? url : undefined;
}

/**
 * pokemontcg.io answers a missing logo/symbol with a 404 whose BODY is the
 * Poké Ball card back (portrait, 640×892). The browser decodes it and fires
 * `load` (valid PNG), NOT `error`, so a plain onError can't catch it and the
 * card back renders as if it were the set's art. Real set logos + symbols are
 * landscape or square wordmarks; only the card-back placeholder is portrait —
 * so a taller-than-wide asset is the placeholder. Treat it as missing.
 */
function isCardBackPlaceholder(img: HTMLImageElement): boolean {
	return img.naturalWidth > 0 && img.naturalHeight > img.naturalWidth;
}

/**
 * Liquid-glass set tile. Four elements:
 *  - backdrop: the set logo, upscaled + blurred, glowing the tile in the set's
 *    own colors behind a frosted glass pane;
 *  - logo: crisp, centered — the brand hero;
 *  - symbol: nested inside a completion ring;
 *  - completion stat: bold owned/total + percent.
 *
 * Pass `vaultLink` to link to the vault per-set page instead of the browse page.
 * Without `ownedCount` (browse context) the ring/stat are omitted and the symbol
 * sits alone.
 */
export function SetTile({
	seriesSlug,
	set,
	ownedCount,
	vaultLink,
}: {
	seriesSlug: string;
	set: NavSet;
	ownedCount?: number;
	/** When true, link target is /vault/sets/$set (set id) instead of /$series/$set. */
	vaultLink?: boolean;
}) {
	const [logoFailed, setLogoFailed] = useState(false);
	const [symbolFailed, setSymbolFailed] = useState(false);
	const logoRef = useRef<HTMLImageElement>(null);
	const symbolRef = useRef<HTMLImageElement>(null);
	const showCount = ownedCount != null;
	const logo = nonEmptyUrl(set.logo);
	const symbol = nonEmptyUrl(set.symbol);
	// Reset + re-check on url change. A cached/SSR image can finish loading before
	// React binds onLoad (the project's cached-image race), so the portrait
	// card-back check must ALSO run here against the already-`complete` image —
	// onLoad alone would miss it and render the Poké Ball placeholder.
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-check on logo change
	useEffect(() => {
		setLogoFailed(false);
		const img = logoRef.current;
		if (img?.complete && isCardBackPlaceholder(img)) setLogoFailed(true);
	}, [set.logo]);
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-check on symbol change
	useEffect(() => {
		setSymbolFailed(false);
		const img = symbolRef.current;
		if (img?.complete && isCardBackPlaceholder(img)) setSymbolFailed(true);
	}, [set.symbol]);
	const pct =
		showCount && set.total > 0
			? Math.min(100, Math.round((ownedCount / set.total) * 100))
			: 0;
	const linkProps = vaultLink
		? ({
				to: "/vault/sets/$set" as const,
				params: { set: set.id },
				"aria-label": `View vault for ${set.name}`,
			} as const)
		: ({
				to: "/$series/$set" as const,
				params: { series: seriesSlug, set: set.slug },
				search: LIST_SEARCH_DEFAULTS,
				"aria-label": `Browse ${set.name}`,
			} as const);

	return (
		<Link
			{...linkProps}
			className="group relative block aspect-4/5 w-full max-w-full overflow-hidden rounded-2xl transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_12px_30px_-8px_rgba(0,0,0,0.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--primary) focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none motion-reduce:hover:translate-y-0"
		>
			{/* ── Backdrop: the set logo, blurred + saturated → per-set color field ── */}
			{logo && !logoFailed && (
				<img
					src={logo}
					alt=""
					aria-hidden="true"
					className="absolute inset-0 h-full w-full scale-[1.7] object-contain opacity-50 blur-2xl saturate-150 transition-opacity duration-300 group-hover:opacity-75"
				/>
			)}
			{/* Base tint + bottom darkening so the logo + stat stay legible */}
			<span
				aria-hidden="true"
				className="absolute inset-0 bg-linear-to-b from-black/40 via-black/10 to-black/75"
			/>

			{/* ── Frosted glass pane: blur + film + bright top edge + inset depth ── */}
			<span
				aria-hidden="true"
				className="absolute inset-0 rounded-2xl border border-white/10 bg-white/5 shadow-[inset_0_1px_0_rgba(255,255,255,0.28),inset_0_-1px_0_rgba(0,0,0,0.35)] backdrop-blur-xl"
			/>

			{/* ── Specular sheen sweep on hover ── */}
			<span
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-white/15 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full motion-reduce:hidden"
			/>

			{/* ── Content ── */}
			<span className="relative z-10 flex h-full flex-col items-center justify-between gap-2 p-4">
				{/* Logo hero (some TCGdex sets have no logo — show the name instead) */}
				<span className="flex w-full flex-1 items-center justify-center px-1">
					{logo && !logoFailed ? (
						<img
							ref={logoRef}
							src={logo}
							alt={set.name}
							onError={() => setLogoFailed(true)}
							onLoad={(e) => {
								if (isCardBackPlaceholder(e.currentTarget)) setLogoFailed(true);
							}}
							className="max-h-[60%] max-w-[88%] object-contain drop-shadow-[0_2px_10px_rgba(0,0,0,0.55)]"
						/>
					) : (
						<span className="text-balance text-center font-semibold text-sm text-white/85 drop-shadow-[0_2px_10px_rgba(0,0,0,0.55)]">
							{set.name}
						</span>
					)}
				</span>

				{/* Symbol-in-ring + completion stat (vault), or lone symbol (browse) */}
				{showCount ? (
					<span className="flex w-full items-center gap-3">
						<ProgressRing pct={pct}>
							{symbol && !symbolFailed ? (
								<img
									ref={symbolRef}
									src={symbol}
									alt=""
									aria-hidden="true"
									onError={() => setSymbolFailed(true)}
									onLoad={(e) => {
										if (isCardBackPlaceholder(e.currentTarget))
											setSymbolFailed(true);
									}}
									className="h-5 w-5 object-contain"
								/>
							) : null}
						</ProgressRing>
						<span className="flex min-w-0 flex-col leading-none">
							<span className="text-xl font-bold tabular-nums text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.7)]">
								{ownedCount}/{set.total}
							</span>
							<span className="mt-1 text-[11px] font-medium uppercase tracking-wide text-white/65">
								{pct}% complete
							</span>
						</span>
					</span>
				) : symbol && !symbolFailed ? (
					<img
						ref={symbolRef}
						src={symbol}
						alt=""
						aria-hidden="true"
						onError={() => setSymbolFailed(true)}
						onLoad={(e) => {
							if (isCardBackPlaceholder(e.currentTarget)) setSymbolFailed(true);
						}}
						className="h-7 w-7 self-end object-contain opacity-80"
					/>
				) : null}
			</span>
		</Link>
	);
}
