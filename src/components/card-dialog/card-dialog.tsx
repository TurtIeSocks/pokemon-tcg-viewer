import { useEffect, useState } from "react";
import { useLoaderData, useLocation, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { FocusCardData } from "../../api";
import { usePokemonList } from "../../hooks/use-pokemon-list";
import { useStore } from "../../store";
import { useRecentsStore } from "../../store/recents";
import { getTypeColor } from "../../utils/card-colors";
import { pokemonNameByDex } from "../../utils/pokemon-name";
import { CrossLinkOverlay } from "../cross-link-overlay";
import { HoloCard, type HoloCardData } from "../holo-card";
import { buildPriceLines } from "./price-lines";

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
		setSeries: card.setSeries,
		setReleaseDate: card.setReleaseDate,
		cardNumber: card.cardNumber,
		nationalPokedexNumbers: card.nationalPokedexNumbers,
	};
}

async function requestTiltPermission(): Promise<boolean> {
	if (typeof window === "undefined") return false;
	const D = window.DeviceOrientationEvent as
		| (typeof DeviceOrientationEvent & {
				requestPermission?: () => Promise<"granted" | "denied">;
		  })
		| undefined;
	if (!D) return false;
	if (typeof D.requestPermission === "function") {
		try {
			return (await D.requestPermission()) === "granted";
		} catch {
			return false;
		}
	}
	return true;
}

export function CardDialog() {
	const card = useLoaderData() as FocusCardData;
	const navigate = useNavigate();
	const location = useLocation();
	const pokemonList = usePokemonList();
	const owned = useStore((s) => !!s.owned[card.id]);
	const add = useStore((s) => s.addToCollection);
	const remove = useStore((s) => s.removeFromCollection);
	const addRecentlyViewed = useRecentsStore((s) => s.addRecentlyViewed);
	useEffect(() => {
		addRecentlyViewed(toHoloCardData(card));
	}, [card, addRecentlyViewed]);
	const [tilt, setTilt] = useState(false);

	const isPokemon = card.supertype === "Pokémon";
	const priceLines = buildPriceLines(card);

	const crossLinks: { label: string; to: string }[] = [];
	for (const dex of card.nationalPokedexNumbers ?? []) {
		const name = pokemonNameByDex(pokemonList, dex);
		if (name)
			crossLinks.push({
				label: `View all ${name}`,
				to: `/?q=${encodeURIComponent(name)}`,
			});
	}
	crossLinks.push({
		label: `Go to ${card.setName}`,
		to: `/?setId=${card.setId}`,
	});

	const close = () => {
		if (location.key === "default") navigate("/");
		else navigate(-1);
	};

	return (
		<Dialog open onOpenChange={(o) => !o && close()}>
			<DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
				<DialogTitle className="sr-only">{card.name}</DialogTitle>
				<div className="grid gap-6 md:grid-cols-2">
					<div className="flex flex-col items-center gap-3">
						<HoloCard
							imageUrl={card.imageUrl}
							name={card.name}
							rarity={card.rarity}
							subtypes={card.subtypes}
							supertype={card.supertype}
							setId={card.setId}
							cardNumber={card.cardNumber}
							size="focus"
							tilt={tilt}
						/>
						<Button
							variant="outline"
							size="sm"
							onClick={async () => {
								if (tilt) return setTilt(false);
								if (await requestTiltPermission()) setTilt(true);
							}}
						>
							{tilt ? "Tilt: on" : "Tilt to shine"}
						</Button>
					</div>

					<div className="space-y-5">
						<div className="flex items-start justify-between gap-4">
							<div>
								<h2 className="text-2xl font-bold">{card.name}</h2>
								<p className="text-muted-foreground">
									{card.supertype}
									{card.subtypes?.length
										? ` · ${card.subtypes.join(", ")}`
										: ""}
								</p>
							</div>
							{card.hp && (
								<div className="text-right">
									<span className="text-3xl font-bold text-primary">
										{card.hp}
									</span>
									<span className="block text-xs text-muted-foreground">
										HP
									</span>
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
								<h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
									Abilities
								</h3>
								{card.abilities.map((a) => (
									<div
										key={a.name}
										className="mb-2 rounded-lg bg-secondary p-3"
									>
										<div className="font-medium">
											{a.name}{" "}
											<span className="text-xs text-muted-foreground">
												{a.type}
											</span>
										</div>
										<p className="mt-1 text-sm text-muted-foreground">
											{a.text}
										</p>
									</div>
								))}
							</section>
						) : null}

						{card.attacks?.length ? (
							<section>
								<h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
									Attacks
								</h3>
								{card.attacks.map((atk) => (
									<div
										key={atk.name}
										className="mb-2 rounded-lg bg-secondary p-3"
									>
										<div className="flex items-center justify-between">
											<span className="font-medium">{atk.name}</span>
											{atk.damage && (
												<span className="font-bold text-primary">
													{atk.damage}
												</span>
											)}
										</div>
										{atk.cost?.length ? (
											<p className="mt-1 text-xs text-muted-foreground">
												Cost: {atk.cost.join(", ")}
											</p>
										) : null}
										{atk.text && (
											<p className="mt-1 text-sm text-muted-foreground">
												{atk.text}
											</p>
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
										{card.weaknesses
											.map((w) => `${w.type} ${w.value}`)
											.join(", ")}
									</p>
								) : null}
								{card.resistances?.length ? (
									<p>
										Resistance:{" "}
										{card.resistances
											.map((r) => `${r.type} ${r.value}`)
											.join(", ")}
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

						{priceLines.length ? (
							<section className="space-y-1 text-sm">
								{priceLines.map((l) => (
									<p key={l.source}>
										<strong>{l.source}</strong> · {l.priceLabel} ·{" "}
										<a
											href={l.url}
											target="_blank"
											rel="noopener noreferrer"
											className="text-primary underline"
										>
											open ↗
										</a>
									</p>
								))}
							</section>
						) : null}

						<div className="flex gap-3">
							<Button
								className="flex-1"
								variant={owned ? "default" : "outline"}
								onClick={() =>
									owned ? remove(card.id) : add(toHoloCardData(card))
								}
							>
								{owned ? "✓ In collection — remove" : "+ Add to collection"}
							</Button>
						</div>

						<CrossLinkOverlay links={crossLinks} />
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
