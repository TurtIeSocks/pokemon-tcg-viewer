"use client";

import { Link, useNavigate } from "@tanstack/react-router";
import {
	ArrowLeft,
	Check,
	Pencil,
	Printer,
	RotateCcw,
	Share2,
	Trash2,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
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
	removeRuleFromBinder,
	restoreCardToBinder,
	useUserland,
} from "../../store/userland/userland-store";
import {
	useBinderValue,
	useHideValue,
} from "../../store/userland/valuation-hooks";
import { cardThumbSrc, type HoloCardData, holoCardProps } from "../holo-card";
import {
	CardSelectionProvider,
	useCardSelection,
} from "../islands/card-selection";
import { HoloCardIsland } from "../islands/holo-card-island";
import { BinderFormDialog } from "./binder-form-dialog";
import {
	moveCardsBetweenBindersWithUndo,
	removeCardsFromBinderWithUndo,
} from "./binder-mutations";
import { BinderPickerDialog } from "./binder-picker-dialog";
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

/** Pill chip with an inline × remove button; used for the rule chips. */
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

/** Props shared by the members section (which lives under the selection provider). */
interface MemberSectionProps {
	/** The binder whose members are shown. */
	binder: Binder;
	/** Hydrated member cards for the grid. */
	memberCards: HoloCardData[];
	/** Owned-card set for the owned/missing color treatment. */
	ownedCardIds: Set<string>;
}

/**
 * Members heading + multi-select toggle + bulk action bar + the grid. Consumes
 * the surrounding {@link CardSelectionProvider}: when select mode is OFF the grid
 * is the interactive {@link OwnedMissingGrid} (per-card mini-nav remove/move via
 * binder context); when ON, tiles become selection toggles and the bulk bar
 * removes / moves every selected card through the undo-wrapped mutations.
 */
function MemberSection({
	binder,
	memberCards,
	ownedCardIds,
}: MemberSectionProps) {
	const { active, selected, toggleActive, toggle, clear } = useCardSelection();
	const binders = useUserland((s) => s.binders);
	// A move target is any OTHER binder (never the one the cards already live in).
	const moveTargets = useMemo(
		() => Object.values(binders).filter((b) => b.id !== binder.id),
		[binders, binder.id],
	);
	const [moveOpen, setMoveOpen] = useState(false);
	const [newBinderOpen, setNewBinderOpen] = useState(false);
	// Selection snapshot captured when the user opts to create a NEW target binder,
	// consumed once that binder is saved. A ref: only read in the save handler.
	const pendingMoveRef = useRef<string[] | null>(null);

	function handleBulkRemove() {
		void removeCardsFromBinderWithUndo(binder.id, [...selected]);
		clear();
	}

	function handleBulkMove(targetId: string) {
		void moveCardsBetweenBindersWithUndo([...selected], binder.id, targetId);
		clear();
		setMoveOpen(false);
	}

	function handleNewBinderSaved(created: Binder) {
		const ids = pendingMoveRef.current;
		pendingMoveRef.current = null;
		if (!ids || ids.length === 0) return;
		void moveCardsBetweenBindersWithUndo(ids, binder.id, created.id);
		clear();
	}

	const toggleLabel = !active
		? m.vault_select_cards()
		: selected.size > 0
			? m.vault_clear_selected()
			: m.form_cancel();

	return (
		<div>
			<div className="mb-3 flex items-center justify-between gap-2">
				<h2 className="text-[10.5px] uppercase tracking-[0.18em] text-(--faint) font-semibold">
					{m.binder_members_heading()}
					{memberCards.length > 0 && (
						<span className="ml-2 font-mono tabular-nums text-(--ink-muted) normal-case tracking-normal text-sm">
							({memberCards.length})
						</span>
					)}
				</h2>
				{memberCards.length > 0 && (
					<Button
						type="button"
						variant="outline"
						size="sm"
						aria-pressed={active}
						onClick={toggleActive}
					>
						{toggleLabel}
					</Button>
				)}
			</div>

			{/* Bulk action bar — only while a selection exists. */}
			{active && selected.size > 0 && (
				<div className="mb-3 flex flex-wrap items-center gap-2 rounded-(--r-control) border border-(--hairline) bg-(--glass) p-2 backdrop-blur-xl">
					<span className="ml-1 font-mono tabular-nums text-sm text-(--ink-muted)">
						{selected.size}
					</span>
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="text-danger"
						onClick={handleBulkRemove}
					>
						{m.binder_bulk_remove()}
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => setMoveOpen(true)}
					>
						{m.binder_bulk_move()}
					</Button>
				</div>
			)}

			{active ? (
				<ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
					{memberCards.map((card) => {
						const isSelected = selected.has(card.id);
						return (
							<li key={card.id}>
								<button
									type="button"
									aria-pressed={isSelected}
									aria-label={`${isSelected ? "Deselect" : "Select"} ${card.name}`}
									onClick={() => toggle(card.id)}
									className="relative block w-full cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--primary-wash)"
								>
									<HoloCardIsland
										{...holoCardProps(card)}
										owned={ownedCardIds.has(card.id)}
										dimUnowned
									/>
									{isSelected && (
										<div
											aria-hidden="true"
											className="absolute inset-0 rounded-lg bg-primary/40"
										>
											<div className="flex h-full items-center justify-center">
												<Check className="size-10 text-white drop-shadow" />
											</div>
										</div>
									)}
								</button>
							</li>
						);
					})}
				</ul>
			) : (
				<OwnedMissingGrid
					cards={memberCards}
					ownedCardIds={ownedCardIds}
					binderId={binder.id}
					binder={binder}
				/>
			)}

			{/* Bulk "move to…" picker: pick an existing target, or create a new one. */}
			<BinderPickerDialog
				open={moveOpen}
				onOpenChange={setMoveOpen}
				title={m.binder_bulk_move()}
				binders={moveTargets}
				onPick={handleBulkMove}
				onCreateNew={() => {
					pendingMoveRef.current = [...selected];
					setMoveOpen(false);
					setNewBinderOpen(true);
				}}
			/>
			<BinderFormDialog
				open={newBinderOpen}
				onOpenChange={setNewBinderOpen}
				onSaved={handleNewBinderSaved}
			/>
		</div>
	);
}

/** Props for {@link ExcludedSection}. */
interface ExcludedSectionProps {
	/** The binder whose exclusions are shown. */
	binder: Binder;
	/** Hydrated excluded cards (resolved from `binder.excludeCardIds`). */
	cards: HoloCardData[];
}

/**
 * Collapsible list of cards excluded from the binder (a smart-rule match the user
 * hid, or a manual card they removed). Each row restores visibility via
 * {@link restoreCardToBinder} — the surface that makes rule exclusions reversible.
 */
function ExcludedSection({ binder, cards }: ExcludedSectionProps) {
	if (binder.excludeCardIds.length === 0) return null;
	return (
		<details className="rounded-(--r-panel) border border-border bg-(--glass) p-4 backdrop-blur-xl">
			<summary className="cursor-pointer text-[10.5px] uppercase tracking-[0.18em] text-(--faint) font-semibold">
				{m.binder_excluded_heading()}
				<span className="ml-2 font-mono tabular-nums text-(--ink-muted) normal-case tracking-normal text-sm">
					({binder.excludeCardIds.length})
				</span>
			</summary>
			<ul className="mt-3 flex flex-col gap-2">
				{cards.map((card) => (
					<li
						key={card.id}
						className="flex items-center gap-3 rounded-(--r-control) border border-(--hairline) bg-(--glass) p-2"
					>
						<img
							src={cardThumbSrc(card)}
							alt=""
							className="h-12 w-auto rounded"
							loading="lazy"
						/>
						<span className="min-w-0 flex-1 truncate text-sm text-(--ink)">
							{card.name}
						</span>
						<Button
							type="button"
							variant="soft"
							size="sm"
							aria-label={m.binder_restore_aria({ name: card.name })}
							onClick={() => void restoreCardToBinder(binder.id, card.id)}
						>
							<RotateCcw className="h-4 w-4 mr-1" />
							{m.binder_restore()}
						</Button>
					</li>
				))}
			</ul>
		</details>
	);
}

/** Props for {@link BinderDetail}. */
interface BinderDetailProps {
	/** The binder to display and manage. */
	binder: Binder;
}

/** Full-page binder view: header, progress, rule chips, member grid, exclusions. */
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

	// Hydrate excluded cards for the "Excluded" section, same cross-region join.
	const excludedCards = useMemo(() => {
		if (binder.excludeCardIds.length === 0 || setById.size === 0) return [];
		return binder.excludeCardIds
			.map((id) => {
				const card = resolveCardAcrossRegions(id, indices);
				return card ? hydrateCard(card, setById, i18n) : null;
			})
			.filter((c): c is NonNullable<typeof c> => c !== null);
	}, [binder.excludeCardIds, indices, setById, i18n]);

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

			{/* Members grid (with per-card + bulk binder controls) */}
			<CardSelectionProvider>
				<MemberSection
					binder={binder}
					memberCards={memberCards}
					ownedCardIds={ownedCardIds}
				/>
			</CardSelectionProvider>

			{/* Excluded cards + restore */}
			<ExcludedSection binder={binder} cards={excludedCards} />

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
