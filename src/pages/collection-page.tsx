import { CardGrid } from "../components/card-grid";
import { CollectionToggle } from "../components/collection-toggle";
import { CrossLinkOverlay } from "../components/cross-link-overlay";
import type { HoloCardData } from "../components/holo-card";
import { PokemonTimeline } from "../components/pokemon-timeline";
import { ViewModeToggle } from "../components/view-mode-toggle";
import { useViewModeParam } from "../hooks/use-url-selection";
import { useStore } from "../store";

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
		<div className="mx-auto flex h-full w-full min-h-0 max-w-7xl flex-col px-4">
			<div className="flex shrink-0 items-center justify-between gap-3 py-5">
				<div>
					<h1 className="text-2xl font-bold">Your Collection</h1>
					<p className="text-sm text-muted-foreground">
						{unique === 0
							? "No cards yet — tap + on any card to add it"
							: `${copies} copies · ${unique} unique`}
					</p>
				</div>
				<ViewModeToggle
					value={view}
					onChange={setView}
					disabled={unique === 0}
				/>
			</div>
			{unique === 0 ? (
				<div className="py-12 text-center text-muted-foreground">
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
				<div className="min-h-0 flex-1 overflow-y-auto">
					<PokemonTimeline
						cards={cards}
						loading={false}
						hasMore={false}
						onLoadMore={() => {}}
						renderOverlay={renderOverlay}
					/>
				</div>
			)}
		</div>
	);
}
