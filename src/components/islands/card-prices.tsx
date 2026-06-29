import { ClientOnly } from "@tanstack/react-router";
import { GlassPanel } from "@/components/ui/glass";
import { PRICING_ENABLED } from "@/lib/pricing-flag";
import { buildPriceLines } from "../../lib/price-lines";
import type { FocusCardData } from "../../server/card-mappers";

export function CardPrices({ card }: { card: FocusCardData }) {
	if (!PRICING_ENABLED) return null;
	return (
		<ClientOnly fallback={null}>
			<PriceLines card={card} />
		</ClientOnly>
	);
}

function PriceLines({ card }: { card: FocusCardData }) {
	const lines = buildPriceLines(card);
	if (!lines.length) return null;
	return (
		<GlassPanel className="mt-2 p-3.5">
			<div className="flex flex-col gap-1.5">
				{lines.map((l) => {
					const [value, ...rest] = l.priceLabel.split(" ");
					const qualifier = rest.join(" ");
					return (
						<div
							key={l.source}
							className="flex items-center justify-between gap-3"
						>
							<span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--faint)]">
								{l.source}
							</span>
							<div className="flex items-center gap-2">
								<span className="font-mono text-[13px] font-bold tabular-nums text-[var(--success)]">
									{value}
								</span>
								{qualifier ? (
									<span className="font-mono text-[11px] text-[var(--ink-muted)]">
										{qualifier}
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
					);
				})}
			</div>
		</GlassPanel>
	);
}
