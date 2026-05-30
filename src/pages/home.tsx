import { useNavigate } from "react-router";
import { HoloCard } from "../components/holo-card";
import { SearchInput } from "../components/search-bar/search-input";
import { useNameQueryParam } from "../hooks/use-url-selection";
import { useStore } from "../store";
import { useRecentsStore } from "../store/recents";

export function Home() {
	const navigate = useNavigate();
	const [, setQuery] = useNameQueryParam();
	const recentSearches = useRecentsStore((s) => s.recentSearches);
	const recentlyViewed = useRecentsStore((s) => s.recentlyViewed);
	const clearRecentSearches = useRecentsStore((s) => s.clearRecentSearches);
	const owned = useStore((s) => s.owned);

	const empty = recentSearches.length === 0 && recentlyViewed.length === 0;

	return (
		<div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-8 px-4 py-16">
			<img
				src={`${import.meta.env.BASE_URL}logo-64.png`}
				alt=""
				className="size-20"
			/>
			<h1 className="text-center text-2xl font-bold">
				Pokémon TCG Holo Playground
			</h1>
			<SearchInput
				autoFocus
				placeholder="Search any card by name…"
				className="w-full"
			/>

			{recentSearches.length > 0 && (
				<section className="w-full">
					<div className="mb-2 flex items-center justify-between">
						<h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
							Recent searches
						</h2>
						<button
							type="button"
							onClick={clearRecentSearches}
							className="text-xs text-muted-foreground hover:text-foreground"
						>
							Clear
						</button>
					</div>
					<div className="flex flex-wrap gap-2">
						{recentSearches.map((q) => (
							<button
								key={q}
								type="button"
								onClick={() => setQuery(q)}
								className="rounded-full bg-secondary px-3 py-1 text-sm text-foreground hover:bg-secondary/80"
							>
								{q}
							</button>
						))}
					</div>
				</section>
			)}

			{recentlyViewed.length > 0 && (
				<section className="w-full">
					<h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
						Recently viewed
					</h2>
					<div className="flex flex-wrap gap-3">
						{recentlyViewed.map((card) => (
							<HoloCard
								key={card.id}
								imageUrl={card.imageUrl}
								imageUrlSmall={card.imageUrlSmall}
								name={card.name}
								rarity={card.rarity}
								subtypes={card.subtypes}
								supertype={card.supertype}
								setId={card.setId}
								series={card.setSeries}
								variants={card.variants}
								cardNumber={card.cardNumber}
								owned={!!owned[card.id]}
								onClick={(e) => {
									if (e.defaultPrevented) return;
									navigate(`/card/${card.id}`);
								}}
								style={{ width: 150 }}
							/>
						))}
					</div>
				</section>
			)}

			{empty && (
				<p className="text-center text-sm text-muted-foreground">
					Search a card above, or pick a set from the sidebar.
				</p>
			)}
		</div>
	);
}
