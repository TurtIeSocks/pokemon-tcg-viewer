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
		<section className="flex flex-wrap gap-x-5 gap-y-1.5 font-mono text-[13px]">
			{lines.map((l) => {
				const [value, ...rest] = l.priceLabel.split(" ");
				const qualifier = rest.join(" ");
				return (
					<a
						key={l.source}
						href={l.url}
						target="_blank"
						rel="noopener noreferrer"
						className="text-[#7d7a70] no-underline transition-colors hover:text-[color:var(--accent,#c9a86a)] focus-visible:text-[color:var(--accent,#c9a86a)] focus-visible:outline-none"
					>
						<b className="font-bold text-[color:var(--accent,#c9a86a)]">
							{value}
						</b>{" "}
						{qualifier} · {l.source} ↗
					</a>
				);
			})}
		</section>
	);
}
