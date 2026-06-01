import { ClientOnly } from "@tanstack/react-router";
import { buildPriceLines } from "../../lib/price-lines";
import type { FocusCardData } from "../../server/card-mappers";

export function CardPrices({ card }: { card: FocusCardData }) {
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
		<section className="space-y-1 text-sm">
			{lines.map((l) => (
				<p key={l.source}>
					<strong>{l.source}</strong> · {l.priceLabel} ·{" "}
					<a href={l.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">
						open ↗
					</a>
				</p>
			))}
		</section>
	);
}
