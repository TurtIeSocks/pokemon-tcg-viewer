import type { FocusCardData } from "../../server/card-mappers";
import { getTypeColor } from "../../utils/card-colors";

export function CardMeta({ card }: { card: FocusCardData }) {
	const isPokemon = card.supertype === "Pokémon";
	return (
		<div className="min-w-0 space-y-5 overflow-y-auto">
			<div className="flex items-start justify-between gap-4">
				<div className="min-w-0">
					<h1 className="text-2xl font-bold">{card.name}</h1>
					<p className="text-muted-foreground">
						{card.supertype}
						{card.subtypes?.length ? ` · ${card.subtypes.join(", ")}` : ""}
					</p>
				</div>
				{card.hp && (
					<div className="shrink-0 text-right">
						<span className="text-3xl font-bold text-primary">{card.hp}</span>
						<span className="block text-xs text-muted-foreground">HP</span>
					</div>
				)}
			</div>

			{card.types?.length ? (
				<div className="flex flex-wrap gap-2">
					{card.types.map((t) => (
						<span
							key={t}
							className="rounded-full px-3 py-1 text-sm font-medium text-white"
							style={{ backgroundColor: getTypeColor(t) }}
						>
							{t}
						</span>
					))}
				</div>
			) : null}

			{card.abilities?.length ? (
				<section>
					<h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
						Abilities
					</h2>
					{card.abilities.map((a) => (
						<div key={a.name} className="mb-2 rounded-lg bg-secondary p-3">
							<div className="font-medium">
								{a.name}{" "}
								<span className="text-xs text-muted-foreground">{a.type}</span>
							</div>
							<p className="mt-1 text-sm text-muted-foreground">{a.text}</p>
						</div>
					))}
				</section>
			) : null}

			{card.attacks?.length ? (
				<section>
					<h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
						Attacks
					</h2>
					{card.attacks.map((atk) => (
						<div key={atk.name} className="mb-2 rounded-lg bg-secondary p-3">
							<div className="flex items-center justify-between">
								<span className="font-medium">{atk.name}</span>
								{atk.damage && (
									<span className="font-bold text-primary">{atk.damage}</span>
								)}
							</div>
							{atk.cost?.length ? (
								<p className="mt-1 text-xs text-muted-foreground">
									Cost: {atk.cost.join(", ")}
								</p>
							) : null}
							{atk.text && (
								<p className="mt-1 text-sm text-muted-foreground">{atk.text}</p>
							)}
						</div>
					))}
				</section>
			) : null}

			{isPokemon &&
			(card.weaknesses?.length ||
				card.resistances?.length ||
				card.retreatCost?.length) ? (
				<section className="space-y-1 text-sm text-muted-foreground">
					{card.weaknesses?.length ? (
						<p>
							Weakness:{" "}
							{card.weaknesses.map((w) => `${w.type} ${w.value}`).join(", ")}
						</p>
					) : null}
					{card.resistances?.length ? (
						<p>
							Resistance:{" "}
							{card.resistances.map((r) => `${r.type} ${r.value}`).join(", ")}
						</p>
					) : null}
					{card.retreatCost?.length ? (
						<p>Retreat: {card.retreatCost.length}</p>
					) : null}
				</section>
			) : null}

			{card.rules?.length ? (
				<section className="space-y-1">
					{card.rules.map((r) => (
						<p key={r} className="text-sm text-muted-foreground">
							{r}
						</p>
					))}
				</section>
			) : null}

			<div className="border-t border-border pt-3 text-sm">
				<p className="font-medium">{card.setName}</p>
				<p className="text-muted-foreground">
					{card.setSeries} · #{card.cardNumber}
					{card.rarity ? ` · ${card.rarity}` : ""}
				</p>
				{(card.flavorText || card.artist) && (
					<p className="mt-2 italic text-muted-foreground">
						{card.flavorText}
						{card.artist ? ` — ${card.artist}` : ""}
					</p>
				)}
			</div>
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
