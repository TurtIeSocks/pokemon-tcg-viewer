// src/components/pokedex/species-tile.tsx
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { getCardAccent } from "@/utils/card-colors";
import { LIST_SEARCH_DEFAULTS } from "../../lib/list-search";
import { type PokedexRow, spriteUrl } from "../../lib/pokedex";
import { titleCaseSlug } from "../../lib/slug";

// Faint inline silhouette shown when a dex has no PokéAPI sprite (gaps/forms).
const FALLBACK_SPRITE =
	"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ccircle cx='32' cy='32' r='22' fill='%23ffffff' opacity='0.12'/%3E%3C/svg%3E";

/** One species in the Pokédex directory: pixel sprite + name + dex # + card count. */
export function SpeciesTile({ row }: { row: PokedexRow }) {
	// Derive the sprite from the current dex rather than seeding state once: the
	// virtualized grid reuses a tile instance across rows when the list reorders
	// (sort/filter), so a stored src would go stale. Failure is tracked by dex so
	// a reused instance still shows the right sprite for its new species.
	const [failedDex, setFailedDex] = useState<number | null>(null);
	const src = failedDex === row.dex ? FALLBACK_SPRITE : spriteUrl(row.dex);
	const glow = getCardAccent(row.type ? [row.type] : undefined);
	return (
		<Link
			to="/pokemon/$name"
			params={{ name: row.name }}
			search={LIST_SEARCH_DEFAULTS}
			className="group block rounded-2xl border border-white/10 bg-white/[0.05] p-2.5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-1px_0_rgba(0,0,0,0.35)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] motion-reduce:transition-none"
		>
			<div className="relative flex h-24 items-center justify-center">
				<span
					aria-hidden="true"
					className="absolute h-20 w-20 rounded-full opacity-50 blur-2xl"
					style={{ background: glow }}
				/>
				<img
					src={src}
					alt={row.name}
					loading="lazy"
					onError={() => setFailedDex(row.dex)}
					className="relative z-10 h-20 w-20 [image-rendering:pixelated]"
				/>
			</div>
			<div className="truncate font-sans text-sm font-semibold text-[var(--ink)]">
				{titleCaseSlug(row.name)}
			</div>
			<div className="mt-0.5 font-mono text-[11px] text-[var(--ink-muted)] tabular-nums">
				#{String(row.dex).padStart(3, "0")}
			</div>
			<div className="mt-1.5 inline-block rounded-full border border-[var(--primary)]/25 bg-[var(--primary)]/10 px-2 font-mono text-[10px] text-[var(--primary)] tabular-nums">
				{row.count} {row.count === 1 ? "card" : "cards"}
			</div>
		</Link>
	);
}
