import { Link } from "@tanstack/react-router";
import { LIST_SEARCH_DEFAULTS } from "../../lib/list-search";
import type { NavSet } from "../../lib/nav-tree";
import { ProgressRing } from "../ui/progress-ring";

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
	const showCount = ownedCount != null;
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
			className="group relative block aspect-[4/5] w-full max-w-full overflow-hidden rounded-2xl transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_12px_30px_-8px_rgba(0,0,0,0.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none motion-reduce:hover:translate-y-0"
		>
			{/* ── Backdrop: the set logo, blurred + saturated → per-set color field ── */}
			<img
				src={set.logo}
				alt=""
				aria-hidden="true"
				className="absolute inset-0 h-full w-full scale-[1.7] object-contain opacity-50 blur-2xl saturate-150 transition-opacity duration-300 group-hover:opacity-75"
			/>
			{/* Base tint + bottom darkening so the logo + stat stay legible */}
			<span
				aria-hidden="true"
				className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/10 to-black/75"
			/>

			{/* ── Frosted glass pane: blur + film + bright top edge + inset depth ── */}
			<span
				aria-hidden="true"
				className="absolute inset-0 rounded-2xl border border-white/10 bg-white/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.28),inset_0_-1px_0_rgba(0,0,0,0.35)] backdrop-blur-xl"
			/>

			{/* ── Specular sheen sweep on hover ── */}
			<span
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/15 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full motion-reduce:hidden"
			/>

			{/* ── Content ── */}
			<span className="relative z-10 flex h-full flex-col items-center justify-between gap-2 p-4">
				{/* Logo hero (some TCGdex sets have no logo — show the name instead) */}
				<span className="flex w-full flex-1 items-center justify-center px-1">
					{set.logo ? (
						<img
							src={set.logo}
							alt={set.name}
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
							<img
								src={set.symbol}
								alt=""
								aria-hidden="true"
								className="h-5 w-5 object-contain"
							/>
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
				) : (
					<img
						src={set.symbol}
						alt=""
						aria-hidden="true"
						className="h-7 w-7 self-end object-contain opacity-80"
					/>
				)}
			</span>
		</Link>
	);
}
