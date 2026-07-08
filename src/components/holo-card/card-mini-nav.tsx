import { useRouter } from "@tanstack/react-router";
import { Check, FolderPlus, Maximize2, Plus } from "lucide-react";
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
import { BinderPickerDialog } from "../binders/binder-picker-dialog";
import { useCollectionToggle } from "../collection-toggle/use-collection-toggle";
import type { HoloCardData } from "./types";

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
				"transition-[background-color,transform] duration-150 ease-[var(--ease)]",
				"hover:scale-105 focus-visible:scale-105",
				"motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:focus-visible:scale-100",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]",
				tone === "owned"
					? "bg-[var(--success)]/85 hover:bg-[var(--success)] focus-visible:bg-[var(--success)]"
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
 * binder (open the binder picker). Reusable across every card render path;
 * positioned by the host (HoloCard's lower-third `miniNav` slot).
 */
export function CardMiniNav({ card }: { card: HoloCardData }) {
	const { owned, count, activate } = useCollectionToggle(card);
	const router = useRouter();
	const slugIndex = useSlugIndex();
	const displayLanguage = useDisplayLanguage();
	const binders = useUserland((s) => s.binders);
	const binderList = useMemo(() => Object.values(binders), [binders]);

	// Binder picker + inline "create binder" state (mirrors bulk-add-menu). The
	// pending card id is only read in a handler, so a ref avoids a wasted render.
	const [pickerOpen, setPickerOpen] = useState(false);
	const [newBinderOpen, setNewBinderOpen] = useState(false);
	const pendingCardRef = useRef<string | null>(null);

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

	function handleNewBinderSaved(b: Binder) {
		const cardId = pendingCardRef.current;
		if (!cardId) return;
		void addCardsToBinder(b.id, [cardId]);
		pendingCardRef.current = null;
	}

	return (
		<>
			<div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.05] p-1 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.28),inset_0_-1px_0_rgba(0,0,0,0.35)]">
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
			</div>

			<BinderPickerDialog
				open={pickerOpen}
				onOpenChange={setPickerOpen}
				title={`Add ${card.name} to a binder`}
				description="Drop this card into a binder."
				binders={binderList}
				onPick={(id) => void addCardsToBinder(id, [card.id])}
				onCreateNew={() => {
					pendingCardRef.current = card.id;
					setNewBinderOpen(true);
				}}
			/>
			<BinderFormDialog
				open={newBinderOpen}
				onOpenChange={setNewBinderOpen}
				onSaved={handleNewBinderSaved}
			/>
		</>
	);
}
