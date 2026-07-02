import { ClientOnly, createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import type { OwnedMissingMode } from "@/components/vault/owned-missing-grid";
import { OwnedMissingGrid } from "@/components/vault/owned-missing-grid";
import { useStore } from "@/store";
import { queryCorpus, setsById } from "@/store/corpus/corpus-engine";
import { useCorpusRuntime } from "@/store/corpus/corpus-runtime";
import { useActiveI18n, useEnsureI18n } from "@/store/corpus/i18n-active-hooks";
import { useEnsureCorpus } from "@/store/corpus/use-ensure-corpus";
import { allLoadedSets } from "@/store/sets-slice";
import { useOwnedCardIdSet } from "@/store/userland/selectors";

export const Route = createFileRoute("/vault/sets/$set")({
	component: VaultSetDetail,
});

/** Exported for tests; wrap in a router context when rendering standalone. */
export function VaultSetDetailInner() {
	useEnsureCorpus();
	useEnsureI18n();
	const { set: setId } = Route.useParams();
	const index = useCorpusRuntime((s) => s.index);
	// The owned-set view's setId may be from any region (an asia set), so
	// resolve it against sets merged across every loaded region. useShallow
	// keeps the array reference stable across renders.
	const sets = useStore(useShallow(allLoadedSets));
	const ownedCardIds = useOwnedCardIdSet();
	const i18n = useActiveI18n();
	const [mode, setMode] = useState<OwnedMissingMode>("all");

	const { cards, setName } = useMemo(() => {
		if (!index || sets.length === 0) return { cards: [], setName: null };
		const setMap = setsById(sets);
		const found = sets.find((s) => s.id === setId);
		if (!found) return { cards: [], setName: null };
		return {
			cards: queryCorpus(index, { setId, relevance: false }, setMap, i18n),
			setName: found.name,
		};
	}, [index, sets, setId, i18n]);

	if (!setName) {
		return (
			<div className="py-12 text-center space-y-4">
				<p className="text-muted-foreground">Set not found.</p>
				<Link
					to="/vault/sets"
					className="text-sm underline text-muted-foreground hover:text-foreground"
				>
					Back to sets
				</Link>
			</div>
		);
	}

	const ownedCount = cards.filter((c) => ownedCardIds.has(c.id)).length;
	const total = cards.length;

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex flex-col gap-1">
				<h1 className="text-2xl font-bold">{setName}</h1>
				<p className="text-sm text-muted-foreground">
					{ownedCount}/{total} owned
				</p>
			</div>

			{/* Mode toggle */}
			<div className="flex items-center gap-2">
				{(["all", "owned", "missing"] as OwnedMissingMode[]).map((m) => (
					<Button
						key={m}
						variant={mode === m ? "default" : "outline"}
						size="sm"
						onClick={() => setMode(m)}
						aria-pressed={mode === m}
					>
						{m.charAt(0).toUpperCase() + m.slice(1)}
					</Button>
				))}
			</div>

			{/* Grid */}
			<OwnedMissingGrid cards={cards} ownedCardIds={ownedCardIds} mode={mode} />
		</div>
	);
}

function VaultSetDetail() {
	return (
		<ClientOnly
			fallback={
				<p className="py-12 text-center text-muted-foreground">Loading set…</p>
			}
		>
			<VaultSetDetailInner />
		</ClientOnly>
	);
}
