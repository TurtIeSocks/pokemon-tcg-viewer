"use client";

import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Pencil, Share2, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import { OwnedMissingGrid } from "@/components/vault/owned-missing-grid";
import { binderRuleLabel } from "@/lib/binder-rule-label";
import { useStore } from "../../store";
import {
	hydrateCard,
	resolveCardAcrossRegions,
	setsById,
} from "../../store/corpus/corpus-engine";
import { useCorpusRuntime } from "../../store/corpus/corpus-runtime";
import {
	useActiveI18n,
	useEnsureI18n,
} from "../../store/corpus/i18n-active-hooks";
import { allLoadedSets } from "../../store/sets-slice";
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
	toggleCardOwned,
} from "../../store/userland/userland-store";
import { BinderFormDialog } from "./binder-form-dialog";
import { ShareDialog } from "./share-dialog";

interface RemovableChipProps {
	/** Display text for the chip. */
	label: string;
	/** Called when the remove button is clicked. */
	onRemove: () => void;
	/** Accessible label for the remove button (e.g. "Remove rule Foo"). */
	removeLabel: string;
}

/** Pill chip with an inline × remove button; used for rule and manual-card chips. */
function RemovableChip({ label, onRemove, removeLabel }: RemovableChipProps) {
	return (
		<span className="inline-flex items-center gap-1 rounded-[var(--r-control)] border border-[var(--hairline)] bg-[var(--glass)] px-3 py-1 text-sm text-[var(--ink)]">
			{label}
			<button
				type="button"
				aria-label={removeLabel}
				className="ml-1 text-[var(--ink-muted)] hover:text-[var(--danger)] leading-none"
				onClick={onRemove}
			>
				<span aria-hidden="true">×</span>
			</button>
		</span>
	);
}

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
	const indices = useCorpusRuntime((s) => s.indices);
	// Members can span regions (a binder goal isn't region-bound), so resolve
	// cards + set names across ALL loaded regions, not just the active one.
	const allSets = useStore(useShallow(allLoadedSets));
	useEnsureI18n();
	const i18n = useActiveI18n();

	// Build dexName resolver from the corpus index (active region; dex names are
	// species names, English fallback is fine for the cross-link label).
	const dexNameResolver = useMemo(
		() =>
			(n: number): string | undefined => {
				if (!index) return undefined;
				return index.cards.find((c) => c.nationalPokedexNumbers?.includes(n))
					?.name;
			},
		[index],
	);

	// Build setName resolver from the merged (all-region) sets list.
	const setNameResolver = useMemo(
		() =>
			(setId: string): string | undefined =>
				allSets.find((s) => s.id === setId)?.name,
		[allSets],
	);

	// Hydrate member card list for the grid, resolving each id across regions.
	const memberCards = useMemo(() => {
		if (!memberIds || allSets.length === 0) return [];
		const sb = setsById(allSets);
		return Array.from(memberIds)
			.map((id) => {
				const card = resolveCardAcrossRegions(id, indices);
				return card ? hydrateCard(card, sb, i18n) : null;
			})
			.filter((c): c is NonNullable<typeof c> => c !== null);
	}, [memberIds, indices, allSets, i18n]);

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
			{/* Back link */}
			<Link
				to="/vault/binders"
				aria-label="Back to binders"
				className="inline-flex items-center gap-1 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors"
			>
				<ArrowLeft className="h-4 w-4" />
				Binders
			</Link>

			{/* Header */}
			<div className="flex items-start gap-4">
				<div className="flex-1 min-w-0">
					<h1 className="font-display text-2xl font-bold truncate text-[var(--ink)]">
						{binder.name}
					</h1>
					{binder.description && (
						<p className="text-[var(--ink-muted)] mt-1">{binder.description}</p>
					)}
				</div>
				<div className="flex gap-2 shrink-0">
					<Button
						variant="ghost"
						size="sm"
						onClick={() => setEditOpen(true)}
						aria-label="Edit binder"
					>
						<Pencil className="h-4 w-4 mr-1" />
						Edit
					</Button>
					<Button
						variant="soft"
						size="sm"
						onClick={() => setShareOpen(true)}
						aria-label="Share binder"
					>
						<Share2 className="h-4 w-4 mr-1" />
						Share
					</Button>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => void handleDelete()}
						aria-label="Delete binder"
						className="text-[var(--danger)] hover:text-[var(--danger)] border-[var(--danger)]/30"
					>
						<Trash2 className="h-4 w-4 mr-1" />
						Delete
					</Button>
				</div>
			</div>

			{/* Progress summary */}
			{progress ? (
				<div className="rounded-[var(--r-panel)] border border-[var(--border)] bg-[var(--glass)] p-4 space-y-2 backdrop-blur-xl">
					<div className="flex justify-between text-sm">
						<span className="text-[10.5px] uppercase tracking-[0.18em] text-[var(--faint)] font-semibold self-center">
							Progress
						</span>
						<span className="font-mono tabular-nums text-[var(--ink-muted)]">
							<span
								className={
									progress.total > 0 && progress.owned === progress.total
										? "text-[var(--success)]"
										: "text-[var(--ink)]"
								}
							>
								{progress.owned}
							</span>
							/{progress.total} cards
							{progress.total > 0
								? ` (${Math.round((progress.owned / progress.total) * 100)}%)`
								: ""}
						</span>
					</div>
					<ProgressBar
						value={progress.owned}
						total={progress.total}
						className="h-2"
					/>
				</div>
			) : null}

			{/* Rule chips */}
			{binder.rules.length > 0 && (
				<div>
					<h2 className="text-[10.5px] uppercase tracking-[0.18em] text-[var(--faint)] font-semibold mb-2">
						Rules
					</h2>
					<div className="flex flex-wrap gap-2">
						{binder.rules.map((rule) => {
							const label = binderRuleLabel(rule.query, {
								setName: setNameResolver,
								dexName: dexNameResolver,
							});
							return (
								<RemovableChip
									key={rule.id}
									label={label}
									removeLabel={`Remove rule ${label}`}
									onRemove={() => void removeRuleFromBinder(binder.id, rule.id)}
								/>
							);
						})}
					</div>
				</div>
			)}

			{/* Members grid */}
			<div>
				<h2 className="text-[10.5px] uppercase tracking-[0.18em] text-[var(--faint)] font-semibold mb-3">
					Members
					{memberCards.length > 0 && (
						<span className="ml-2 font-mono tabular-nums text-[var(--ink-muted)] normal-case tracking-normal text-sm">
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
								<RemovableChip
									key={cardId}
									label={card.name}
									removeLabel={`Remove ${card.name} from binder`}
									onRemove={() => void removeCardFromBinder(binder.id, cardId)}
								/>
							);
						})}
					</div>
				)}

				<OwnedMissingGrid
					cards={memberCards}
					ownedCardIds={ownedCardIds}
					onToggleOwned={(id) => void toggleCardOwned(id)}
				/>
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
