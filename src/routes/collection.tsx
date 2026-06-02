import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { type ChangeEvent, useEffect, useRef } from "react";
import { CollectionToggle } from "../components/collection-toggle";
import { HoloCardIsland } from "../components/islands/holo-card-island";
import { useStore } from "../store";
import { loadCorpus } from "../store/corpus/corpus-runtime";
import { downloadSnapshot, parseSnapshot } from "../store/userland/backup";
import { useOwnedCardViews } from "../store/userland/selectors";
import {
	exportUserData,
	importUserData,
} from "../store/userland/userland-store";

export const Route = createFileRoute("/collection")({
	head: () => ({ meta: [{ title: "Your Collection — Pokémon TCG" }] }),
	component: CollectionPage,
});

function CollectionInner() {
	const loadSets = useStore((s) => s.loadSets);
	useEffect(() => {
		void loadCorpus();
		void loadSets();
	}, [loadSets]);

	const cards = useOwnedCardViews();
	const fileRef = useRef<HTMLInputElement>(null);

	async function onExport() {
		downloadSnapshot(await exportUserData());
	}
	async function onImport(e: ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		if (!file) return;
		try {
			await importUserData(parseSnapshot(await file.text()), "replace");
		} catch (err) {
			alert(err instanceof Error ? err.message : "Import failed");
		} finally {
			if (fileRef.current) fileRef.current.value = "";
		}
	}

	return (
		<>
			<div className="mb-4 flex gap-2">
				<button
					type="button"
					onClick={onExport}
					className="rounded border px-3 py-1.5 text-sm hover:bg-secondary"
				>
					Export backup
				</button>
				<button
					type="button"
					onClick={() => fileRef.current?.click()}
					className="rounded border px-3 py-1.5 text-sm hover:bg-secondary"
				>
					Import backup
				</button>
				<input
					ref={fileRef}
					type="file"
					accept="application/json"
					className="hidden"
					onChange={onImport}
				/>
			</div>
			{cards.length === 0 ? (
				<p className="py-12 text-center text-muted-foreground">
					Your binder is empty. Add cards from any set.
				</p>
			) : (
				<ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
					{cards.map((card) => (
						<li key={card.id}>
							<HoloCardIsland
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
								hoverOverlay={<CollectionToggle card={card} />}
							/>
						</li>
					))}
				</ul>
			)}
		</>
	);
}

function CollectionPage() {
	return (
		<div className="mx-auto w-full max-w-7xl overflow-y-auto px-4 py-5">
			<h1 className="mb-4 text-2xl font-bold">Your Collection</h1>
			<ClientOnly
				fallback={
					<p className="py-12 text-center text-muted-foreground">
						Loading your collection…
					</p>
				}
			>
				<CollectionInner />
			</ClientOnly>
		</div>
	);
}
