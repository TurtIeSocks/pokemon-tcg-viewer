"use client";

import { useNavigate } from "@tanstack/react-router";
import { Pencil, Share2, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import { OwnedMissingGrid } from "@/components/vault/owned-missing-grid";
import { binderRuleLabel } from "@/lib/binder-rule-label";
import { useStore } from "../../store";
import { hydrateCard, setsById } from "../../store/corpus/corpus-engine";
import { useCorpusRuntime } from "../../store/corpus/corpus-runtime";
import {
	useBinderMembers,
	useBinderProgress,
	useOwnedCardIdSet,
} from "../../store/userland/selectors";
import type { Binder } from "../../store/userland/types";
import {
	removeBinder,
	removeCardFromBinder,
	removeRuleFromBinder,
} from "../../store/userland/userland-store";
import { BinderFormDialog } from "./binder-form-dialog";
import { ShareDialog } from "./share-dialog";

/** Props for {@link BinderDetail}. */
interface BinderDetailProps {
	/** The binder to display and manage. */
	binder: Binder;
}

/** Full-page binder view: header, progress, rule chips, member card grid. */
export function BinderDetail({ binder }: BinderDetailProps) {
	const navigate = useNavigate();
	const [editOpen, setEditOpen] = useState(false);
	const [shareOpen, setShareOpen] = useState(false);

	const progress = useBinderProgress(binder.id);
	const memberIds = useBinderMembers(binder.id);
	const ownedCardIds = useOwnedCardIdSet();

	const index = useCorpusRuntime((s) => s.index);
	const sets = useStore((s) => s.sets);

	// Build dexName resolver from the corpus index.
	const dexNameResolver = useMemo(
		() =>
			(n: number): string | undefined => {
				if (!index) return undefined;
				return index.cards.find((c) => c.nationalPokedexNumbers?.includes(n))
					?.name;
			},
		[index],
	);

	// Build setName resolver from the sets list.
	const setNameResolver = useMemo(
		() =>
			(setId: string): string | undefined =>
				sets?.find((s) => s.id === setId)?.name,
		[sets],
	);

	// Hydrate member card list for the grid.
	const memberCards = useMemo(() => {
		if (!memberIds || !index || !sets) return [];
		const sb = setsById(sets);
		return Array.from(memberIds)
			.map((id) => {
				const card = index.byId.get(id);
				return card ? hydrateCard(card, sb) : null;
			})
			.filter((c): c is NonNullable<typeof c> => c !== null);
	}, [memberIds, index, sets]);

	async function handleDelete() {
		if (
			!window.confirm(`Delete binder "${binder.name}"? This cannot be undone.`)
		)
			return;
		await removeBinder(binder.id);
		await navigate({ to: "/vault/binders" });
	}

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-start gap-4">
				<div className="flex-1 min-w-0">
					<h1 className="text-2xl font-bold truncate">{binder.name}</h1>
					{binder.description && (
						<p className="text-muted-foreground mt-1">{binder.description}</p>
					)}
				</div>
				<div className="flex gap-2 shrink-0">
					<Button
						variant="outline"
						size="sm"
						onClick={() => setEditOpen(true)}
						aria-label="Edit binder"
					>
						<Pencil className="h-4 w-4 mr-1" />
						Edit
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={() => setShareOpen(true)}
						aria-label="Share binder"
					>
						<Share2 className="h-4 w-4 mr-1" />
						Share
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={() => void handleDelete()}
						aria-label="Delete binder"
						className="text-destructive hover:text-destructive"
					>
						<Trash2 className="h-4 w-4 mr-1" />
						Delete
					</Button>
				</div>
			</div>

			{/* Progress summary */}
			{progress ? (
				<div className="rounded-lg border bg-card p-4 space-y-2">
					<div className="flex justify-between text-sm">
						<span className="font-medium">Progress</span>
						<span className="text-muted-foreground">
							{progress.owned}/{progress.total} cards
							{progress.total > 0
								? ` (${Math.round((progress.owned / progress.total) * 100)}%)`
								: ""}
						</span>
					</div>
					<ProgressBar
						value={progress.owned}
						total={progress.total}
						className="h-3"
					/>
				</div>
			) : null}

			{/* Rule chips */}
			{binder.rules.length > 0 && (
				<div>
					<h2 className="text-lg font-semibold mb-2">Rules</h2>
					<div className="flex flex-wrap gap-2">
						{binder.rules.map((rule) => {
							const label = binderRuleLabel(rule.query, {
								setName: setNameResolver,
								dexName: dexNameResolver,
							});
							return (
								<span
									key={rule.id}
									className="inline-flex items-center gap-1 rounded-full border bg-secondary px-3 py-1 text-sm"
								>
									{label}
									<button
										type="button"
										aria-label={`Remove rule ${label}`}
										className="ml-1 text-muted-foreground hover:text-destructive leading-none"
										onClick={() =>
											void removeRuleFromBinder(binder.id, rule.id)
										}
									>
										<span aria-hidden="true">×</span>
									</button>
								</span>
							);
						})}
					</div>
				</div>
			)}

			{/* Members grid */}
			<div>
				<h2 className="text-lg font-semibold mb-3">
					Members
					{memberCards.length > 0 && (
						<span className="ml-2 text-sm font-normal text-muted-foreground">
							({memberCards.length})
						</span>
					)}
				</h2>

				{/* Manual-include remove affordance — shown above the grid for included cards */}
				{binder.includeCardIds.length > 0 && memberCards.length > 0 && (
					<div className="mb-3 flex flex-wrap gap-2">
						{binder.includeCardIds.map((cardId) => {
							const card = index?.byId.get(cardId);
							if (!card) return null;
							return (
								<span
									key={cardId}
									className="inline-flex items-center gap-1 rounded-full border bg-secondary px-3 py-1 text-sm"
								>
									{card.name}
									<button
										type="button"
										aria-label={`Remove ${card.name} from binder`}
										className="ml-1 text-muted-foreground hover:text-destructive leading-none"
										onClick={() => void removeCardFromBinder(binder.id, cardId)}
									>
										<span aria-hidden="true">×</span>
									</button>
								</span>
							);
						})}
					</div>
				)}

				<OwnedMissingGrid cards={memberCards} ownedCardIds={ownedCardIds} />
			</div>

			<BinderFormDialog
				open={editOpen}
				onOpenChange={setEditOpen}
				binder={binder}
			/>
			<ShareDialog
				open={shareOpen}
				onOpenChange={setShareOpen}
				binder={binder}
			/>
		</div>
	);
}
