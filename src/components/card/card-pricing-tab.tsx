import { GlassPanel } from "@/components/ui/glass";
import { Skeleton } from "@/components/ui/skeleton";
import type { FocusCardData } from "../../server/card-mappers";
import { CardPrices } from "../islands/card-prices";

const SECTION =
	"font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--faint)]";

/** Shimmer stand-in for the price panel while the detail RPC is in flight. */
function PriceGhost() {
	return (
		<GlassPanel className="p-3.5" aria-hidden="true">
			<div className="flex flex-col gap-2.5">
				{["a", "b"].map((k) => (
					<div key={k} className="flex items-center justify-between gap-3">
						<Skeleton className="h-3 w-20" />
						<Skeleton className="h-3 w-14" />
					</div>
				))}
			</div>
		</GlassPanel>
	);
}

/**
 * Pricing tab body. Shows live market prices (TCGplayer / Cardmarket) plus a
 * "coming soon" placeholder for the price-history section (PR 4).
 */
export function CardPricingTab({
	card,
	pending,
}: {
	card: FocusCardData;
	pending?: boolean;
}) {
	return (
		<div className="flex flex-col gap-5">
			<section aria-label="Market prices">
				<div className={SECTION}>Market prices</div>
				<div className="mt-2">
					{pending ? <PriceGhost /> : <CardPrices card={card} />}
				</div>
			</section>
			<section aria-label="Price history">
				<div className={SECTION}>Price history</div>
				<GlassPanel className="mt-2 p-4 text-[13px] text-[var(--ink-muted)]">
					Price history. Coming soon.
				</GlassPanel>
			</section>
		</div>
	);
}
