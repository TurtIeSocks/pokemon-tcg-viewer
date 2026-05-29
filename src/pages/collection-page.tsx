import "../components/header.css";
import { CardGrid } from "../components/card-grid";
import { CollectionToggle } from "../components/collection-toggle";
import { CrossLinkOverlay } from "../components/cross-link-overlay";
import type { HoloCardData } from "../components/holo-card";
import { PokemonTimeline } from "../components/pokemon-timeline";
import { ViewModeToggle } from "../components/view-mode-toggle";
import { useViewModeParam } from "../hooks/use-url-selection";
import { useStore } from "../store";
import "./collection-page.css";

function renderOverlay(card: HoloCardData) {
	return (
		<>
			<CrossLinkOverlay
				links={[
					{ label: `Go to ${card.setName}`, to: `/?setId=${card.setId}` },
				]}
			/>
			<CollectionToggle card={card} />
		</>
	);
}

export function CollectionPage() {
	const [view, setView] = useViewModeParam();
	const owned = useStore((s) => s.owned);
	const entries = Object.values(owned);
	const cards = entries.map((o) => o.card);
	const unique = entries.length;
	const copies = entries.reduce((n, o) => n + o.count, 0);

	return (
		<>
			<header className="header">
				<h1>Pokémon TCG Holo Playground</h1>
				<div className="set-meta">
					<div>
						<div className="set-name">Your Collection</div>
						<div className="set-sub">
							{unique === 0
								? "No cards yet — tap + on any card to add it"
								: `${copies} copies · ${unique} unique`}
						</div>
					</div>
					<ViewModeToggle
						value={view}
						onChange={setView}
						disabled={unique === 0}
					/>
				</div>
			</header>
			{unique === 0 ? (
				<div className="collection-empty">
					<p>Your binder is empty. Add cards from any view.</p>
				</div>
			) : view === "grid" ? (
				<CardGrid
					setId="collection"
					cards={cards}
					onEndReached={() => {}}
					renderOverlay={renderOverlay}
				/>
			) : (
				<PokemonTimeline
					cards={cards}
					loading={false}
					hasMore={false}
					onLoadMore={() => {}}
					renderOverlay={renderOverlay}
				/>
			)}
		</>
	);
}
