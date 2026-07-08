import { ClientOnly, createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { OwnedMissingMode } from "@/components/vault/owned-missing-grid";
import { OwnedMissingGrid } from "@/components/vault/owned-missing-grid";
import { m } from "@/paraglide/messages";
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

/** Mode toggle labels. Thunks (not called at module scope) so they always read
 *  the active locale at render time. */
const MODE_LABELS: Record<OwnedMissingMode, () => string> = {
	all: () => m.vault_mode_all(),
	owned: () => m.vault_mode_owned(),
	missing: () => m.vault_mode_missing(),
};

/** Exported for tests; wrap in a router context when rendering standalone. */
export function VaultSetDetailInner() {
	useEnsureCorpus();
	useEnsureI18n();
	const { set: setId } = Route.useParams();
	const index = useCorpusRuntime((s) => s.index);
	// The owned-set view's setId may be from any region (an asia set), so
	// resolve it against sets merged across every loaded region. allLoadedSets
	// is memoized, so a plain subscription stays ref-stable.
	const sets = useStore(allLoadedSets);
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
				<p className="text-muted-foreground">{m.vault_set_not_found()}</p>
				<Link
					to="/vault/sets"
					className="text-sm underline text-muted-foreground hover:text-foreground"
				>
					{m.vault_back_to_sets()}
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
					{m.vault_owned_of_total({ owned: ownedCount, total })}
				</p>
			</div>

			{/* Mode toggle */}
			<div className="flex items-center gap-2">
				{(["all", "owned", "missing"] as OwnedMissingMode[]).map((opt) => (
					<Button
						key={opt}
						variant={mode === opt ? "default" : "outline"}
						size="sm"
						onClick={() => setMode(opt)}
						aria-pressed={mode === opt}
					>
						{MODE_LABELS[opt]()}
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
				<p className="py-12 text-center text-muted-foreground">
					{m.vault_loading_set()}
				</p>
			}
		>
			<VaultSetDetailInner />
		</ClientOnly>
	);
}
