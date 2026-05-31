import type { FocusCardData } from "../../server/card-mappers";

/**
 * Text-only metadata block: name, set info, types, attacks, flavor text.
 * Reused by both the full CardDetail page (with its own image) and the
 * CardModal (where the image is the interactive HoloCard).
 */
export function CardMeta({ card }: { card: FocusCardData }) {
	return (
		<div className="min-w-0 space-y-3">
			<h1 className="text-2xl font-bold">{card.name}</h1>
			<p className="text-sm text-muted-foreground">
				{card.setName} · {card.setSeries} · #{card.cardNumber}
				{card.rarity ? ` · ${card.rarity}` : ""}
			</p>
			{card.types && card.types.length > 0 && (
				<p className="text-sm">Type: {card.types.join(", ")}</p>
			)}
			{card.attacks && card.attacks.length > 0 && (
				<div className="space-y-2">
					<h2 className="font-semibold">Attacks</h2>
					{card.attacks.map((a) => (
						<div key={a.name} className="text-sm">
							<span className="font-medium">{a.name}</span>
							{a.damage ? ` — ${a.damage}` : ""}
							{a.text ? (
								<p className="text-muted-foreground">{a.text}</p>
							) : null}
						</div>
					))}
				</div>
			)}
			{card.flavorText && (
				<p className="text-sm italic text-muted-foreground">
					{card.flavorText}
				</p>
			)}
		</div>
	);
}

/**
 * SSR-safe focus view: image + metadata. Pointer-reactive HoloCard + live
 * TCGplayer prices are Plan 05 islands (prices must never be cached/OG'd).
 */
export function CardDetail({ card }: { card: FocusCardData }) {
	return (
		<article className="mx-auto grid max-w-4xl gap-6 p-4 md:grid-cols-[auto_1fr]">
			<img
				src={card.imageUrl}
				alt={card.name}
				width={320}
				className="w-full max-w-[320px] rounded-xl"
			/>
			<CardMeta card={card} />
		</article>
	);
}
