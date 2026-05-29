import { useLoaderData, useLocation, useNavigate } from "react-router";
import type { FocusCardData } from "../api";
import { CrossLinkOverlay } from "../components/cross-link-overlay";
import type { HoloCardData } from "../components/holo-card";
import { HoloCard } from "../components/holo-card";
import { usePokemonList } from "../hooks/use-pokemon-list";
import { useStore } from "../store";
import { pokemonNameByDex } from "../utils/pokemon-name";
import "./card-page.css";

function toHoloCardData(card: FocusCardData): HoloCardData {
	return {
		id: card.id,
		imageUrl: card.imageUrl,
		name: card.name,
		rarity: card.rarity,
		subtypes: card.subtypes,
		supertype: card.supertype,
		setId: card.setId,
		setName: card.setName,
		setSeries: "",
		setReleaseDate: card.setReleaseDate,
		cardNumber: card.cardNumber,
		nationalPokedexNumbers: card.nationalPokedexNumbers,
	};
}

interface PriceLine {
	source: "TCGPlayer" | "Cardmarket";
	url: string;
	priceLabel: string;
	updatedAt: string;
}

function buildPriceLines(card: FocusCardData): PriceLine[] {
	const lines: PriceLine[] = [];
	if (card.tcgplayer?.prices && card.tcgplayer.url) {
		const variantKeys = Object.keys(card.tcgplayer.prices);
		const firstVariant = variantKeys[0];
		const prices = firstVariant
			? card.tcgplayer.prices[firstVariant]
			: undefined;
		const value = prices?.market ?? prices?.mid;
		if (value !== undefined) {
			lines.push({
				source: "TCGPlayer",
				url: card.tcgplayer.url,
				priceLabel: `$${value.toFixed(2)} market`,
				updatedAt: card.tcgplayer.updatedAt,
			});
		}
	}
	if (card.cardmarket?.prices && card.cardmarket.url) {
		const value =
			card.cardmarket.prices.averageSellPrice ??
			card.cardmarket.prices.trendPrice ??
			card.cardmarket.prices.avg30;
		if (value !== undefined) {
			lines.push({
				source: "Cardmarket",
				url: card.cardmarket.url,
				priceLabel: `€${value.toFixed(2)} avg`,
				updatedAt: card.cardmarket.updatedAt,
			});
		}
	}
	return lines;
}

export function CardPage() {
	const card = useLoaderData() as FocusCardData;
	const pokemonList = usePokemonList();
	const navigate = useNavigate();
	const location = useLocation();
	const owned = useStore((s) => !!s.owned[card.id]);
	const add = useStore((s) => s.addToCollection);
	const remove = useStore((s) => s.removeFromCollection);
	const isFirstEntry = location.key === "default";
	const isPokemon = card.supertype === "Pokémon";
	const priceLines = buildPriceLines(card);

	const crossLinks: { label: string; to: string }[] = [];
	for (const dex of card.nationalPokedexNumbers ?? []) {
		const name = pokemonNameByDex(pokemonList, dex) ?? `#${dex}`;
		crossLinks.push({ label: `View all ${name}`, to: `/pokemon?dex=${dex}` });
	}
	crossLinks.push({
		label: `Go to ${card.setName}`,
		to: `/?setId=${card.setId}`,
	});

	return (
		<div className="card-page">
			<header className="card-page-header">
				<button
					type="button"
					className="card-page-back"
					onClick={() => (isFirstEntry ? navigate("/") : navigate(-1))}
				>
					← Back
				</button>
				<h1>{card.name}</h1>
				<button
					type="button"
					className={`card-page-collection-button${owned ? " owned" : ""}`}
					aria-pressed={owned}
					onClick={() => {
						if (owned) remove(card.id);
						else add(toHoloCardData(card));
					}}
				>
					{owned ? "✓ In your collection — Remove" : "+ Add to collection"}
				</button>
				<p className="card-page-caption">
					{card.setName} · {card.cardNumber}
					{card.rarity ? ` · ${card.rarity}` : ""}
				</p>
			</header>

			<div className="card-page-grid">
				<div className="card-page-image">
					<HoloCard
						imageUrl={card.imageUrl}
						name={card.name}
						rarity={card.rarity}
						subtypes={card.subtypes}
						supertype={card.supertype}
						setId={card.setId}
						cardNumber={card.cardNumber}
						size="focus"
					/>
				</div>

				<div className="card-page-meta">
					{isPokemon && (
						<section className="card-page-stats">
							{card.hp && <span>HP {card.hp}</span>}
							{card.types && card.types.length > 0 && (
								<span> · {card.types.join("/")}</span>
							)}
							{card.evolvesFrom && (
								<span> · Evolves from {card.evolvesFrom}</span>
							)}
						</section>
					)}

					{card.abilities && card.abilities.length > 0 && (
						<section className="card-page-abilities">
							<h2>Abilities</h2>
							{card.abilities.map((a) => (
								<div key={a.name} className="card-page-ability">
									<h3>
										{a.name}{" "}
										<span className="card-page-ability-type">{a.type}</span>
									</h3>
									<p>{a.text}</p>
								</div>
							))}
						</section>
					)}

					{card.attacks && card.attacks.length > 0 && (
						<section className="card-page-attacks">
							<h2>Attacks</h2>
							{card.attacks.map((atk) => (
								<div key={atk.name} className="card-page-attack">
									<h3>
										{atk.name}
										{atk.damage ? (
											<span className="card-page-damage"> {atk.damage}</span>
										) : null}
									</h3>
									{atk.cost && atk.cost.length > 0 && (
										<p className="card-page-attack-cost">
											Cost: {atk.cost.join(", ")}
										</p>
									)}
									{atk.text && <p>{atk.text}</p>}
								</div>
							))}
						</section>
					)}

					{isPokemon &&
						((card.weaknesses && card.weaknesses.length > 0) ||
							(card.resistances && card.resistances.length > 0) ||
							(card.retreatCost && card.retreatCost.length > 0)) && (
							<section className="card-page-defense">
								{card.weaknesses && card.weaknesses.length > 0 && (
									<p>
										Weakness:{" "}
										{card.weaknesses
											.map((w) => `${w.type} ${w.value}`)
											.join(", ")}
									</p>
								)}
								{card.resistances && card.resistances.length > 0 && (
									<p>
										Resistance:{" "}
										{card.resistances
											.map((r) => `${r.type} ${r.value}`)
											.join(", ")}
									</p>
								)}
								{card.retreatCost && card.retreatCost.length > 0 && (
									<p>Retreat: {card.retreatCost.length}</p>
								)}
							</section>
						)}

					{card.rules && card.rules.length > 0 && (
						<section className="card-page-rules">
							<h2>Rules</h2>
							{card.rules.map((rule) => (
								<p key={rule}>{rule}</p>
							))}
						</section>
					)}

					{(card.flavorText || card.artist) && (
						<section className="card-page-flavor">
							{card.flavorText && <em>{card.flavorText}</em>}
							{card.artist && (
								<p className="card-page-artist">Illustrator: {card.artist}</p>
							)}
						</section>
					)}

					{priceLines.length > 0 && (
						<section className="card-page-pricing">
							<h2>Pricing</h2>
							{priceLines.map((line) => (
								<p key={line.source} className="card-page-price-line">
									<strong>{line.source}</strong> · {line.priceLabel} · Updated{" "}
									{line.updatedAt}{" "}
									<a
										href={line.url}
										target="_blank"
										rel="noopener noreferrer"
										className="card-page-external"
									>
										open ↗
									</a>
								</p>
							))}
						</section>
					)}

					<section className="card-page-related">
						<h2>Related</h2>
						<CrossLinkOverlay links={crossLinks} />
					</section>
				</div>
			</div>
		</div>
	);
}
