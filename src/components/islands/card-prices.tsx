import { ClientOnly } from "@tanstack/react-router";
import { GlassPanel } from "@/components/ui/glass";
import { buildPriceLines } from "@/lib/price-lines";
import {
	useCardPriceEntry,
	useEnsurePrices,
	usePriceSourceDates,
} from "@/store/corpus/prices-runtime";
import type { FocusCardData } from "../../server/card-mappers";

const TCGPLAYER_NOTICE =
	"TCGplayer data — not endorsed or certified by TCGplayer.";

export function CardPrices({ card }: { card: FocusCardData }) {
	return (
		<ClientOnly fallback={null}>
			<PriceLines card={card} />
		</ClientOnly>
	);
}

function PriceLines({ card }: { card: FocusCardData }) {
	// Load once on mount, then revalidate staleness; idempotent (IDB-first,
	// deduped). A 503 before the first prod build resolves to status
	// "unavailable" and simply renders no lines.
	useEnsurePrices();

	const entry = useCardPriceEntry(card.id);
	const dates = usePriceSourceDates();
	const lines = buildPriceLines(card, entry, {
		tpDate: dates.tpDate,
		cmDate: dates.cmDate,
	});
	if (!lines.length) return null;

	const hasTcgplayer = lines.some((l) => l.source === "TCGplayer");
	return (
		<GlassPanel className="mt-2 p-3.5">
			<div className="flex flex-col gap-1.5">
				{lines.map((l) => (
					<div
						key={`${l.source}:${l.finish ?? ""}`}
						className="flex items-center justify-between gap-3"
					>
						<span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--faint)]">
							{l.source}
						</span>
						<div className="flex items-center gap-2">
							<span className="font-mono text-[13px] font-bold tabular-nums text-[var(--success)]">
								{l.priceLabel}
							</span>
							{l.finish ? (
								<span className="font-mono text-[11px] text-[var(--ink-muted)]">
									{l.finish}
								</span>
							) : null}
							<a
								href={l.url}
								target="_blank"
								rel="noopener noreferrer"
								className="font-mono text-[11px] text-[var(--primary)] no-underline transition-colors hover:opacity-80 focus-visible:outline-none focus-visible:opacity-80"
							>
								↗
							</a>
						</div>
					</div>
				))}
			</div>
			{hasTcgplayer ? (
				<p className="mt-2.5 font-mono text-[10px] leading-tight text-[var(--faint)]">
					{TCGPLAYER_NOTICE}
				</p>
			) : null}
		</GlassPanel>
	);
}
