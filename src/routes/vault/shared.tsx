import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { OwnedMissingGrid } from "@/components/vault/owned-missing-grid";
import { useStore } from "@/store";
import { hydrateCard, setsById } from "@/store/corpus/corpus-engine";
import { useCorpusRuntime } from "@/store/corpus/corpus-runtime";
import { useEnsureCorpus } from "@/store/corpus/use-ensure-corpus";
import { allLoadedSets } from "@/store/sets-slice";
import type { BinderSnapshot } from "@/store/userland/share";
import { decodeSnapshot } from "@/store/userland/share";

export const Route = createFileRoute("/vault/shared")({
	component: SharedBinder,
});

/** Exported for tests; wrap in a router context when rendering standalone. */
export function SharedBinderInner() {
	useEnsureCorpus();

	const [snapshot] = useState<BinderSnapshot | null>(() => {
		try {
			const hash = window.location.hash;
			const prefix = "#b=";
			if (!hash.startsWith(prefix)) return null;
			const encoded = hash.slice(prefix.length);
			if (!encoded) return null;
			return decodeSnapshot(encoded);
		} catch {
			return null;
		}
	});

	const index = useCorpusRuntime((s) => s.index);
	// A shared snapshot can contain cards from any region, so resolve set
	// metadata across every loaded region rather than the bare west list.
	// allLoadedSets is memoized, so a plain subscription stays ref-stable.
	const sets = useStore(allLoadedSets);

	const { hydrated, ownedCardIds } = useMemo(() => {
		if (!snapshot || !index) {
			return { hydrated: [], ownedCardIds: new Set<string>() };
		}

		const setMap = setsById(sets);
		const hydratedCards = snapshot.cards.flatMap((sc) => {
			const corpusCard = index.byId.get(sc.cardId);
			if (!corpusCard) return [];
			return [hydrateCard(corpusCard, setMap)];
		});

		const owned = new Set(
			snapshot.cards.filter((c) => c.owned).map((c) => c.cardId),
		);

		return { hydrated: hydratedCards, ownedCardIds: owned };
	}, [snapshot, index, sets]);

	if (!snapshot) {
		return (
			<div className="py-16 text-center space-y-2">
				<p className="text-lg font-medium text-destructive">
					Couldn't read this shared binder. The link may be broken or
					incomplete.
				</p>
			</div>
		);
	}

	const snapshotDate = new Date(snapshot.sharedAt).toLocaleDateString();

	return (
		<div className="space-y-6">
			{/* Snapshot banner — always visible */}
			<div
				role="note"
				className="flex items-center gap-2 rounded-md border border-[color-mix(in_oklch,var(--warning)_40%,transparent)] bg-[color-mix(in_oklch,var(--warning)_12%,transparent)] px-4 py-3 text-[var(--warning)] text-sm font-medium"
			>
				<span aria-hidden="true">📸</span>
				<span>Snapshot from {snapshotDate} · not live</span>
			</div>

			{/* Header */}
			<div className="space-y-1">
				<h1 className="text-2xl font-bold">{snapshot.name}</h1>
				{snapshot.description && (
					<p className="text-muted-foreground">{snapshot.description}</p>
				)}
			</div>

			{/* Grid */}
			<OwnedMissingGrid
				cards={hydrated}
				ownedCardIds={ownedCardIds}
				mode="all"
			/>
		</div>
	);
}

function SharedBinder() {
	return (
		<ClientOnly
			fallback={
				<p className="py-12 text-center text-muted-foreground">
					Loading shared binder…
				</p>
			}
		>
			<SharedBinderInner />
		</ClientOnly>
	);
}
