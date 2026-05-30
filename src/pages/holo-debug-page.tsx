import { useCallback, useEffect, useMemo, useState } from "react";
import { getCardsByPokedexNumber } from "../api";
import { HoloCard, type HoloCardData } from "../components/holo-card";
import {
	buildFoilUrls,
	getCssRarity,
} from "../components/holo-card/foil-assets";
import {
	getHoloClass,
	variantsToHolo,
} from "../components/holo-card/holo-style";
import { useFoilAssets } from "../components/holo-card/use-foil-assets";
import { PokemonFilter } from "../components/pokemon-filter";
import { type CardFetcher, useCards } from "../hooks/use-cards";
import { usePokedexParam } from "../hooks/use-url-selection";
import "./holo-debug-page.css";

/**
 * Dev-only foil QA contact sheet. For a searched Pokémon it renders every card
 * with the foil held statically lit, the resolved holo decision (rarity →
 * class → CDN style → mask state), and — for modern sets — the REAL scanned
 * mask + foil as ground truth. Flag the odd ones and copy their ids to report.
 *
 * Reachable at /holo-debug only in dev (see main.tsx). Not in prod nav.
 */

interface CardDiagProps {
	card: HoloCardData;
	flagged: boolean;
	onToggle: (id: string) => void;
}

function CardDiag({ card, flagged, onToggle }: CardDiagProps) {
	const cssRarity = getCssRarity(card.rarity);
	const foilUrls = cssRarity
		? buildFoilUrls(card.setId, card.cardNumber, cssRarity, card.subtypes)
		: null;
	const holo = variantsToHolo(card.variants);
	const cls = getHoloClass(card.rarity, card.setSeries, holo, card.setId);
	const { masked } = useFoilAssets(
		card.setId,
		card.cardNumber,
		card.rarity,
		card.subtypes,
	);

	const styleMatch = foilUrls?.foilUrl.match(/_foil_([a-z]+)_([a-z]+)_2x/);
	const cdn = foilUrls ? `${styleMatch?.[1]}/${styleMatch?.[2]}` : "none";
	const path = foilUrls
		? masked
			? "mask ✓ (real foil)"
			: "cdn miss → procedural"
		: "procedural";

	return (
		<div className={`hd-card${flagged ? " hd-flagged" : ""}`}>
			<HoloCard
				forceFoil
				imageUrl={card.imageUrl}
				name={card.name}
				rarity={card.rarity}
				subtypes={card.subtypes}
				supertype={card.supertype}
				setId={card.setId}
				series={card.setSeries}
				variants={card.variants}
				cardNumber={card.cardNumber}
			/>
			<div className="hd-meta">
				<code className="hd-id">{card.id}</code>
				<span>
					{card.rarity ?? "—"} · {card.setSeries}
				</span>
				<span>class: {cls}</span>
				<span>
					variants: {card.variants?.join(", ") ?? "—"}
					{holo === false ? " → non-holo" : holo === true ? " → holo" : ""}
				</span>
				<span>cdn: {cdn}</span>
				<span>{path}</span>
			</div>
			{foilUrls && (
				<div className="hd-truth">
					<figure>
						<img src={foilUrls.maskUrl} alt="real mask" loading="lazy" />
						<figcaption>real mask</figcaption>
					</figure>
					<figure>
						<img src={foilUrls.foilUrl} alt="real foil" loading="lazy" />
						<figcaption>real foil</figcaption>
					</figure>
				</div>
			)}
			<button
				type="button"
				className="hd-flag-btn"
				onClick={() => onToggle(card.id)}
			>
				{flagged ? "✓ flagged" : "flag as off"}
			</button>
		</div>
	);
}

export function HoloDebugPage() {
	const [pokedexNumber, setPokedexNumber] = usePokedexParam();
	const [flagged, setFlagged] = useState<Set<string>>(new Set());

	const cacheKey = pokedexNumber === null ? null : String(pokedexNumber);
	const fetcher: CardFetcher = useMemo(
		() => (_key, page, pageSize) => {
			if (pokedexNumber === null) {
				return Promise.resolve({ cards: [], totalCount: 0 });
			}
			return getCardsByPokedexNumber(pokedexNumber, page, pageSize, {
				types: [],
				rarity: [],
				supertype: [],
				subtypes: [],
			});
		},
		[pokedexNumber],
	);
	const { cards, loading, loadMore, hasMore } = useCards(cacheKey, fetcher);

	// Auto-paginate to the full set so the contact sheet shows every card.
	useEffect(() => {
		if (cacheKey && hasMore && !loading) loadMore(cacheKey);
	}, [cacheKey, hasMore, loading, loadMore]);

	const toggle = useCallback((id: string) => {
		setFlagged((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}, []);

	const copyFlagged = () => {
		navigator.clipboard?.writeText([...flagged].join("\n"));
	};

	return (
		<div className="holo-debug">
			<header className="header">
				<h1>Holo Debug — Foil QA</h1>
				<div className="set-meta">
					<div>
						<div className="set-name">Side-by-side ground truth</div>
						<div className="set-sub">
							{cacheKey
								? `#${pokedexNumber} · ${cards.length} cards${hasMore ? " (loading…)" : ""}`
								: "Pick a Pokémon to QA its holo cards"}
						</div>
					</div>
				</div>
			</header>
			<PokemonFilter value={pokedexNumber} onChange={setPokedexNumber} />
			<div className="hd-bar">
				<button
					type="button"
					className="hd-copy-btn"
					onClick={copyFlagged}
					disabled={flagged.size === 0}
				>
					Copy {flagged.size} flagged id{flagged.size === 1 ? "" : "s"}
				</button>
				<span className="hd-legend">
					Each row: our render (foil forced on) + decision + the real CDN
					mask/foil (modern only). Flag the odd ones → copy → paste to Claude.
				</span>
			</div>
			<div className="hd-grid">
				{cards.map((c) => (
					<CardDiag
						key={c.id}
						card={c}
						flagged={flagged.has(c.id)}
						onToggle={toggle}
					/>
				))}
			</div>
			{loading && <div className="loading-pill">Loading…</div>}
		</div>
	);
}
