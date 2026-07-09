"use client";

import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Pencil, Printer, Share2, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import { OwnedMissingGrid } from "@/components/vault/owned-missing-grid";
import { binderRuleLabel } from "@/lib/binder-rule-label";
import { m } from "@/paraglide/messages";
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
import { formatPrice } from "../../store/userland/money";
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
import {
	useBinderValue,
	useHideValue,
} from "../../store/userland/valuation-hooks";
import { BinderFormDialog } from "./binder-form-dialog";
import { missingCardViews } from "./print-missing";
import { PrintMissingDialog } from "./print-missing-dialog";
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
		<span className="inline-flex items-center gap-1 rounded-(--r-control) border border-(--hairline) bg-(--glass) px-3 py-1 text-sm text-(--ink)">
			{label}
			<button
				type="button"
				aria-label={removeLabel}
				className="ml-1 text-(--ink-muted) hover:text-danger leading-none"
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
	const [printOpen, setPrintOpen] = useState(false);

	const progress = useBinderProgress(binder.id);
	const memberIds = useBinderMembers(binder.id);
	const ownedCardIds = useOwnedCardIdSet();
	const { value, currency } = useBinderValue(binder.id);
	const hidden = useHideValue();

	const index = useCorpusRuntime((s) => s.index);
	const indices = useCorpusRuntime((s) => s.indices);
	// Members can span regions (a binder goal isn't region-bound), so resolve
	// cards + set names across ALL loaded regions, not just the active one.
	const allSets = useStore(allLoadedSets);
	useEnsureI18n();
	const i18n = useActiveI18n();

	// Dex-number → species-name map from the corpus index (active region; dex
	// names are species names, English fallback is fine for the cross-link
	// label). First occurrence wins, matching the previous .find() semantics.
	const dexNameByNumber = useMemo(() => {
		const map = new Map<number, string>();
		if (!index) return map;
		for (const card of index.cards) {
			for (const n of card.nationalPokedexNumbers ?? []) {
				if (!map.has(n)) map.set(n, card.name);
			}
		}
		return map;
	}, [index]);

	const dexNameResolver = useMemo(
		() =>
			(n: number): string | undefined =>
				dexNameByNumber.get(n),
		[dexNameByNumber],
	);

	// Merged (all-region) sets indexed by id — shared by the setName resolver
	// and the member-card hydration below.
	const setById = useMemo(() => setsById(allSets), [allSets]);

	// Build setName resolver from the merged (all-region) sets map.
	const setNameResolver = useMemo(
		() =>
			(setId: string): string | undefined =>
				setById.get(setId)?.name,
		[setById],
	);

	// Hydrate member card list for the grid, resolving each id across regions.
	const memberCards = useMemo(() => {
		if (!memberIds || setById.size === 0) return [];
		return Array.from(memberIds)
			.map((id) => {
				const card = resolveCardAcrossRegions(id, indices);
				return card ? hydrateCard(card, setById, i18n) : null;
			})
			.filter((c): c is NonNullable<typeof c> => c !== null);
	}, [memberIds, indices, setById, i18n]);

	// Cards the collector is missing from this binder: hydrated members minus
	// owned. Drives both the "Print missing" button's enabled state and the
	// placeholders laid out in the modal.
	const missingCards = useMemo(
		() => missingCardViews(memberCards, ownedCardIds),
		[memberCards, ownedCardIds],
	);

	async function handleDelete() {
		if (!window.confirm(m.binder_delete_confirm({ name: binder.name }))) return;
		await removeBinder(binder.id);
		await navigate({ to: "/vault/binders" });
	}

	return (
		<div className="space-y-6">
			{/* Back link */}
			<Link
				to="/vault/binders"
				aria-label={m.vault_back_to_binders()}
				className="inline-flex items-center gap-1 text-sm text-(--ink-muted) hover:text-(--ink) transition-colors"
			>
				<ArrowLeft className="h-4 w-4" />
				{m.vault_binders_heading()}
			</Link>

			{/* Header */}
			<div className="flex items-start gap-4">
				<div className="flex-1 min-w-0">
					<h1 className="font-display text-2xl font-bold truncate text-(--ink)">
						{binder.name}
					</h1>
					{binder.description && (
						<p className="text-(--ink-muted) mt-1">{binder.description}</p>
					)}
				</div>
				<div className="flex gap-2 shrink-0">
					<Button
						variant="ghost"
						size="sm"
						onClick={() => setEditOpen(true)}
						aria-label={m.binder_edit_aria()}
					>
						<Pencil className="h-4 w-4 mr-1" />
						{m.binder_edit_button()}
					</Button>
					<Button
						variant="soft"
						size="sm"
						onClick={() => setShareOpen(true)}
						aria-label={m.binder_share_aria()}
					>
						<Share2 className="h-4 w-4 mr-1" />
						{m.binder_share_button()}
					</Button>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => setPrintOpen(true)}
						aria-label={m.binder_print_missing_cards()}
						disabled={missingCards.length === 0}
						title={
							missingCards.length === 0
								? m.binder_print_disabled_title()
								: undefined
						}
					>
						<Printer className="h-4 w-4 mr-1" />
						{m.binder_print_missing_button()}
					</Button>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => void handleDelete()}
						aria-label={m.binder_delete_aria()}
						className="text-danger hover:text-danger border-(--danger)/30"
					>
						<Trash2 className="h-4 w-4 mr-1" />
						{m.stack_delete()}
					</Button>
				</div>
			</div>

			{/* Progress summary */}
			{progress ? (
				<div className="rounded-(--r-panel) border border-border bg-(--glass) p-4 space-y-2 backdrop-blur-xl">
					<div className="flex justify-between text-sm">
						<span className="text-[10.5px] uppercase tracking-[0.18em] text-(--faint) font-semibold self-center">
							{m.binder_progress_label()}
						</span>
						<span className="font-mono tabular-nums text-(--ink-muted)">
							<span
								className={
									progress.total > 0 && progress.owned === progress.total
										? "text-success"
										: "text-(--ink)"
								}
							>
								{progress.owned}
							</span>
							{m.binder_progress_of_total_cards({ total: progress.total })}
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
					{value != null ? (
						<div className="flex justify-between text-sm">
							<span className="text-[10.5px] uppercase tracking-[0.18em] text-(--faint) font-semibold self-center">
								{m.binder_market_value_label()}
							</span>
							<span className="font-mono tabular-nums text-success">
								{hidden ? "•••" : formatPrice(value, currency)}
							</span>
						</div>
					) : null}
				</div>
			) : null}

			{/* Rule chips */}
			{binder.rules.length > 0 && (
				<div>
					<h2 className="text-[10.5px] uppercase tracking-[0.18em] text-(--faint) font-semibold mb-2">
						{m.binder_rules_heading()}
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
									removeLabel={m.binder_remove_rule_aria({ label })}
									onRemove={() => void removeRuleFromBinder(binder.id, rule.id)}
								/>
							);
						})}
					</div>
				</div>
			)}

			{/* Members grid */}
			<div>
				<h2 className="text-[10.5px] uppercase tracking-[0.18em] text-(--faint) font-semibold mb-3">
					{m.binder_members_heading()}
					{memberCards.length > 0 && (
						<span className="ml-2 font-mono tabular-nums text-(--ink-muted) normal-case tracking-normal text-sm">
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
									removeLabel={m.binder_remove_card_aria({ name: card.name })}
									onRemove={() => void removeCardFromBinder(binder.id, cardId)}
								/>
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
			<PrintMissingDialog
				open={printOpen}
				onOpenChange={setPrintOpen}
				cards={missingCards}
			/>
		</div>
	);
}
