import { GlassPanel } from "@/components/ui/glass";
import { Skeleton } from "@/components/ui/skeleton";
import type { FocusCardData } from "../../server/card-mappers";
import { CardPrices } from "../islands/card-prices";
import { CardHistory } from "./card-history";

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
 * Pricing tab body. Shows live market prices (TCGplayer / Cardmarket) plus
 * the price-history chart (range toggle + trend chips).
 */
export function CardPricingTab({
	card,
	pending,
}: {
	card: FocusCardData;
	pending?: boolean;
}) {
	return (
		// h-full: when the folder pane is tall (modal two-pane), the history section
		// flex-grows so its glass panel fills the space beneath the market prices
		// instead of leaving it empty. On the page/mobile the pane is content-sized,
		// so h-full is a no-op and everything keeps its natural height.
		<div className="flex h-full flex-col gap-5">
			<section aria-label="Market prices">
				<div className={SECTION}>Market prices</div>
				<div className="mt-2">
					{pending ? <PriceGhost /> : <CardPrices card={card} />}
				</div>
			</section>
			<section
				aria-label="Price history"
				className="flex min-h-0 flex-1 flex-col"
			>
				<div className={SECTION}>Price history</div>
				<GlassPanel className="mt-2 flex flex-1 flex-col p-4">
					<CardHistory card={card} />
				</GlassPanel>
			</section>
		</div>
	);
}
