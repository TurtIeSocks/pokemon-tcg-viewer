import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { BoosterPack } from "../components/booster-pack";
import { CollectionToggle } from "../components/collection-toggle";
import { CrossLinkOverlay } from "../components/cross-link-overlay";
import type { HoloCardData } from "../components/holo-card";
import { HoloCard } from "../components/holo-card";
import { useStore } from "../store";
import { rollPack } from "../utils/roll-pack";
import "./pack-page.css";

const RIP_DURATION_MS = 320;

export function PackPage() {
	const { setId } = useParams<{ setId: string }>();
	const navigate = useNavigate();
	const sets = useStore((s) => s.sets);
	const pool = useStore((s) => (setId ? s.packCards[setId] : undefined));
	const loading = useStore((s) => (setId ? s.packCardsLoading[setId] : false));
	const loadPackCards = useStore((s) => s.loadPackCards);
	const ownedMap = useStore((s) => s.owned);

	const set = sets?.find((x) => x.id === setId);

	const [ripped, setRipped] = useState(false);
	const [pack, setPack] = useState<HoloCardData[] | null>(null);

	useEffect(() => {
		if (setId) loadPackCards(setId);
	}, [setId, loadPackCards]);

	if (!setId) return null;
	if (!set) {
		return (
			<header className="header">
				<h1>Pokémon TCG Holo Playground</h1>
				<div className="set-meta">
					<div>
						<div className="set-name">Set not found</div>
						<div className="set-sub">No set with id "{setId}".</div>
					</div>
				</div>
			</header>
		);
	}

	const onRip = () => {
		if (!pool || pool.length === 0) return;
		setRipped(true);
		setTimeout(() => {
			setPack(rollPack({ pool }));
		}, RIP_DURATION_MS);
	};

	const onReroll = () => {
		setRipped(false);
		setPack(null);
	};

	return (
		<>
			<header className="header">
				<h1>Pokémon TCG Holo Playground</h1>
				<div className="set-meta">
					<div>
						<div className="set-name">Open a {set.name} pack</div>
						<div className="set-sub">
							{loading
								? "Loading set…"
								: pack
									? "10 cards revealed"
									: "Tap pack to rip"}
						</div>
					</div>
				</div>
			</header>
			<div className="pack-body">
				{!pack ? (
					<BoosterPack set={set} ripped={ripped} onRip={onRip} />
				) : (
					<>
						<div className="pack-reveal-grid">
							{pack.map((card) => (
								<HoloCard
									key={card.id}
									imageUrl={card.imageUrl}
									name={card.name}
									rarity={card.rarity}
									subtypes={card.subtypes}
									supertype={card.supertype}
									setId={card.setId}
									cardNumber={card.cardNumber}
									owned={!!ownedMap[card.id]}
									size="focus"
									hoverOverlay={
										<>
											<CrossLinkOverlay
												links={[
													{
														label: `Go to ${set.name}`,
														to: `/?setId=${set.id}`,
													},
												]}
											/>
											<CollectionToggle card={card} />
										</>
									}
									onClick={(e) => {
										if (e.defaultPrevented) return;
										navigate(`/card/${card.id}`);
									}}
								/>
							))}
						</div>
						<div className="pack-reroll">
							<button
								type="button"
								className="pack-reroll-button"
								onClick={onReroll}
							>
								Open another pack
							</button>
						</div>
					</>
				)}
			</div>
		</>
	);
}
