import { useRouter } from "@tanstack/react-router";
import {
	Check,
	FolderInput,
	FolderMinus,
	FolderPlus,
	Maximize2,
	Plus,
} from "lucide-react";
import type React from "react";
import { useMemo, useRef, useState } from "react";
import { cardModalLinkPropsFor, cardRouteParams } from "../../lib/card-route";
import { faceLanguageFor } from "../../lib/languages";
import { useSlugIndex } from "../../store/corpus/corpus-runtime";
import { useDisplayLanguage } from "../../store/corpus/i18n-active-hooks";
import type { Binder } from "../../store/userland/types";
import {
	addCardsToBinder,
	useUserland,
} from "../../store/userland/userland-store";
import { BinderFormDialog } from "../binders/binder-form-dialog";
import {
	moveCardBetweenBinderWithUndo,
	removeCardFromBinderWithUndo,
} from "../binders/binder-mutations";
import { BinderPickerDialog } from "../binders/binder-picker-dialog";
import { useCollectionToggle } from "../collection-toggle/use-collection-toggle";
import type { HoloCardData } from "./types";

/**
 * The binder a card is being rendered *inside*, plus how it belongs there. When
 * a {@link CardMiniNav} receives this (opt-in — only binder-detail's member grid
 * passes it), the bar gains a source badge ("via rule" / "Added") and per-card
 * remove / move-to-another-binder controls scoped to that binder.
 */
export interface BinderContext {
	/** The binder this card is currently rendered within. */
	binderId: string;
	/** Whether the card belongs via a smart rule or a manual include. */
	source: "manual" | "rule";
}

interface NavButtonProps {
	label: string;
	onClick: (e: React.MouseEvent) => void;
	/** Green "owned" tint for the collection button when the card is owned. */
	tone?: "default" | "owned";
	children: React.ReactNode;
}

/** One glass icon button in the mini-nav bar. Real <button>, keyboard reachable. */
function NavButton({
	label,
	onClick,
	tone = "default",
	children,
}: NavButtonProps) {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			onClick={onClick}
			className={[
				"inline-flex h-8 min-w-8 items-center justify-center gap-0.5 rounded-full px-1.5",
				"font-mono text-xs font-semibold text-white",
				"transition-[background-color,transform] duration-150 ease-(--ease)",
				"hover:scale-105 focus-visible:scale-105",
				"motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:focus-visible:scale-100",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--primary)",
				tone === "owned"
					? "bg-(--success)/85 hover:bg-(--success) focus-visible:bg-(--success)"
					: "hover:bg-white/15 focus-visible:bg-white/15",
			].join(" ")}
		>
			{children}
		</button>
	);
}

/**
 * Unified glass mini-nav bar for a card — the single interaction surface that
 * replaces the old top-right "add to collection" pill. Three glass icon
 * buttons: owned toggle (＋ / ✓ count), expand (open the card modal), and
 * binder (open the binder MEMBERSHIP picker — add/remove this card across every
 * binder). Reusable across every card render path; positioned by the host
 * (HoloCard's lower-third `miniNav` slot).
 *
 * When {@link BinderContext} is supplied (opt-in, from binder-detail's member
 * grid) the bar additionally shows a source badge and per-card remove /
 * move-to-another-binder controls scoped to that binder. Absent it, the bar
 * renders exactly as before.
 */
export function CardMiniNav({
	card,
	binderContext,
}: {
	card: HoloCardData;
	binderContext?: BinderContext;
}) {
	const { owned, count, activate } = useCollectionToggle(card);
	const router = useRouter();
	const slugIndex = useSlugIndex();
	const displayLanguage = useDisplayLanguage();
	const binders = useUserland((s) => s.binders);
	const binderList = useMemo(() => Object.values(binders), [binders]);
	// The "move to…" target list never includes the binder the card is already in.
	const moveTargets = useMemo(
		() =>
			binderContext
				? binderList.filter((b) => b.id !== binderContext.binderId)
				: binderList,
		[binderList, binderContext],
	);

	// Membership picker + move picker + inline "create binder" state (mirrors
	// bulk-add-menu). The pending action is only read in a handler, so a ref
	// avoids a wasted render.
	const [pickerOpen, setPickerOpen] = useState(false);
	const [moveOpen, setMoveOpen] = useState(false);
	const [newBinderOpen, setNewBinderOpen] = useState(false);
	const pendingRef = useRef<
		| { kind: "add"; cardId: string }
		| { kind: "move"; cardId: string; fromId: string }
		| null
	>(null);

	function stop(e: React.MouseEvent) {
		// The bar lives inside the grid's card <Link>; stop the click from also
		// triggering that navigation.
		e.preventDefault();
		e.stopPropagation();
	}

	function handleExpand(e: React.MouseEvent) {
		stop(e);
		const p = slugIndex ? cardRouteParams(slugIndex, card) : null;
		if (!p) return;
		const lang = faceLanguageFor(card, displayLanguage);
		void router.navigate({ ...cardModalLinkPropsFor(p, lang) });
	}

	function handleBinder(e: React.MouseEvent) {
		stop(e);
		setPickerOpen(true);
	}

	function handleRemoveFromBinder(e: React.MouseEvent) {
		stop(e);
		if (!binderContext) return;
		void removeCardFromBinderWithUndo(binderContext.binderId, card.id);
	}

	function handleMove(e: React.MouseEvent) {
		stop(e);
		setMoveOpen(true);
	}

	function handleNewBinderSaved(b: Binder) {
		const pending = pendingRef.current;
		if (!pending) return;
		if (pending.kind === "add") {
			void addCardsToBinder(b.id, [pending.cardId]);
		} else {
			void moveCardBetweenBinderWithUndo(pending.cardId, pending.fromId, b.id);
		}
		pendingRef.current = null;
	}

	return (
		<>
			<div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.28),inset_0_-1px_0_rgba(0,0,0,0.35)]">
				<NavButton
					label={
						owned
							? `Manage stacks of ${card.name}`
							: `Add ${card.name} to collection`
					}
					tone={owned ? "owned" : "default"}
					onClick={(e) => {
						stop(e);
						activate(e);
					}}
				>
					{owned ? (
						<>
							<Check className="size-4" aria-hidden="true" />
							<span className="tabular-nums">{count}</span>
						</>
					) : (
						<Plus className="size-4" aria-hidden="true" />
					)}
				</NavButton>

				<NavButton label={`Expand ${card.name}`} onClick={handleExpand}>
					<Maximize2 className="size-4" aria-hidden="true" />
				</NavButton>

				<NavButton
					label={`Add ${card.name} to a binder`}
					onClick={handleBinder}
				>
					<FolderPlus className="size-4" aria-hidden="true" />
				</NavButton>

				{binderContext ? (
					<>
						<NavButton
							label={`Remove ${card.name} from this binder`}
							onClick={handleRemoveFromBinder}
						>
							<FolderMinus className="size-4" aria-hidden="true" />
						</NavButton>

						<NavButton
							label={`Move ${card.name} to another binder`}
							onClick={handleMove}
						>
							<FolderInput className="size-4" aria-hidden="true" />
						</NavButton>

						<span
							className="inline-flex h-8 items-center rounded-full px-2 font-mono text-[10px] font-semibold uppercase tracking-wide text-white/85"
							title={
								binderContext.source === "rule"
									? "In this binder via a smart rule"
									: "Manually added to this binder"
							}
						>
							{binderContext.source === "rule" ? "via rule" : "Added"}
						</span>
					</>
				) : null}
			</div>

			{/* Membership picker: add/remove this card across every binder. */}
			<BinderPickerDialog
				open={pickerOpen}
				onOpenChange={setPickerOpen}
				title={`Manage binders for ${card.name}`}
				description="Check a binder to add this card. Uncheck to remove it."
				binders={binderList}
				membershipCardId={card.id}
				onPick={() => {}}
				onCreateNew={() => {
					pendingRef.current = { kind: "add", cardId: card.id };
					setNewBinderOpen(true);
				}}
			/>

			{/* Move picker (binder-context only): pick a target, move out of the
			    current binder into it. */}
			{binderContext ? (
				<BinderPickerDialog
					open={moveOpen}
					onOpenChange={setMoveOpen}
					title={`Move ${card.name} to another binder`}
					description="Move this card out of the current binder and into the one you pick."
					binders={moveTargets}
					onPick={(id) =>
						void moveCardBetweenBinderWithUndo(
							card.id,
							binderContext.binderId,
							id,
						)
					}
					onCreateNew={() => {
						pendingRef.current = {
							kind: "move",
							cardId: card.id,
							fromId: binderContext.binderId,
						};
						setNewBinderOpen(true);
					}}
				/>
			) : null}

			<BinderFormDialog
				open={newBinderOpen}
				onOpenChange={setNewBinderOpen}
				onSaved={handleNewBinderSaved}
			/>
		</>
	);
}
