import { ArrowLeft } from "lucide-react";
import { CopyManager } from "./copy-manager";

/**
 * Props for {@link CardCollectionManager}.
 */
export interface CardCollectionManagerProps {
	/** The ID of the card whose copies are managed. */
	cardId: string;
	/** Display name shown in the panel heading. */
	cardName: string;
	/** Set name shown as subtitle; omitted when unavailable. */
	setName?: string;
	/** Collector number shown as subtitle; omitted when unavailable. */
	cardNumber?: string;
	/** Card thumbnail URL shown beside the heading for context. */
	imageUrl?: string;
	/** Known printing variant strings forwarded to {@link CopyManager}. */
	variants?: string[];
	/** Called when the user presses "← Back to Pokémon". */
	onBack: () => void;
}

/**
 * Full-width, roomy panel for managing all owned copies of one card.
 *
 * Renders a top bar (back button + card identity), an optional thumbnail,
 * and the existing {@link CopyManager} (copies list / add / edit / remove-all)
 * with generous whitespace so the 2-column edit form can breathe.
 *
 * Designed to fill a wide slide-in panel or a standalone route; it does NOT
 * own the outer scroll container — the parent must provide that.
 *
 * @example
 * ```tsx
 * <CardCollectionManager
 *   cardId={card.id}
 *   cardName={card.name}
 *   setName={card.setName}
 *   cardNumber={card.cardNumber}
 *   imageUrl={card.imageUrl}
 *   variants={card.variants}
 *   onBack={() => navigate({ to: ".." })}
 * />
 * ```
 */
export function CardCollectionManager({
	cardId,
	cardName,
	setName,
	cardNumber,
	imageUrl,
	variants,
	onBack,
}: CardCollectionManagerProps) {
	const subtitle = [setName, cardNumber ? `#${cardNumber}` : undefined]
		.filter(Boolean)
		.join(" · ");

	return (
		<div className="flex flex-col gap-0 w-full">
			{/* ── Top bar ─────────────────────────────────────────────────────── */}
			<div
				className={[
					"flex items-center gap-4 px-6 py-4",
					"border-b border-border bg-card/60 backdrop-blur-sm",
				].join(" ")}
			>
				{/* Back button — ≥44px tap target */}
				<button
					type="button"
					onClick={onBack}
					aria-label="Card details"
					className={[
						"inline-flex items-center gap-2 shrink-0",
						"min-h-[44px] min-w-[44px] px-3 -ml-3 rounded-lg",
						"text-sm font-medium text-muted-foreground",
						"hover:text-foreground hover:bg-muted/60",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent,#e0b341)]",
						"transition-colors duration-150",
					].join(" ")}
				>
					<ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
					<span>Card Details</span>
				</button>
			</div>

			{/* ── Card identity + thumbnail ─────────────────────────────────── */}
			<div
				className={[
					"flex items-center gap-5 px-6 py-5",
					"border-b border-border",
				].join(" ")}
			>
				{imageUrl && (
					/* Thumbnail — modest size; big art lives in the parent modal */
					<img
						src={imageUrl}
						alt=""
						aria-hidden="true"
						className="h-16 w-auto rounded-lg shrink-0 object-contain shadow-md"
					/>
				)}

				<div className="flex flex-col gap-1 min-w-0">
					<h2
						className="text-xl font-semibold leading-tight"
						aria-label={`${cardName} — Your Collection`}
					>
						{cardName}{" "}
						<span className="text-base font-normal text-muted-foreground">
							— Your Collection
						</span>
					</h2>
					{subtitle && (
						<p className="text-sm text-muted-foreground leading-snug">
							{subtitle}
						</p>
					)}
				</div>
			</div>

			{/* ── Copies section ───────────────────────────────────────────────
			    CopyManager handles its own empty state; no duplication needed. */}
			<div className="flex flex-col gap-0 flex-1 px-6 py-6">
				<CopyManager cardId={cardId} variants={variants} />
			</div>
		</div>
	);
}
