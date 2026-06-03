import { ClientOnly } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { GlassPanel } from "@/components/ui/glass";
import type { FocusCardData } from "../../server/card-mappers";
import { getCardAccent, getReadableAccent } from "../../utils/card-colors";
import { toHoloCardData } from "../card/to-holo";
import { HoloCard } from "../holo-card";
import { CardPrices } from "../islands/card-prices";
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
	/** Card thumbnail URL shown beside the heading for context (fallback when card not provided). */
	imageUrl?: string;
	/** Known printing variant strings forwarded to {@link CopyManager}. */
	variants?: string[];
	/**
	 * Full card data — when provided, renders the holo hero + prices in the
	 * left column. When absent (legacy / test), falls back to the compact
	 * single-column layout.
	 */
	card?: FocusCardData;
	/** Called when the user presses "← Back". */
	onBack: () => void;
}

/**
 * Full-width 2-column panel for managing all owned copies of one card.
 *
 * - Left: sticky holo hero + card meta + TCGplayer prices (when `card` provided).
 * - Right: CopyManager (header "Your copies N" + Add copy, copies list, edit form).
 * - Collapses to 1-column below `md` breakpoint.
 * - Top bar: back pill + card name + `#N` chip.
 *
 * @example
 * ```tsx
 * <CardCollectionManager
 *   cardId={card.id}
 *   cardName={card.name}
 *   card={card}
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
	card,
	onBack,
}: CardCollectionManagerProps) {
	const holo = card ? toHoloCardData(card) : null;

	// Use card-derived accent when full data is available.
	const accent = card
		? getReadableAccent(getCardAccent(card.types))
		: undefined;

	const resolvedSetName = setName ?? card?.setName;
	const resolvedCardNumber = cardNumber ?? card?.cardNumber;
	const resolvedVariants = variants ?? holo?.variants;

	return (
		<div
			className="flex flex-col gap-0 w-full"
			style={
				accent ? ({ "--accent": accent } as React.CSSProperties) : undefined
			}
		>
			{/* ── Top bar ─────────────────────────────────────────────────────── */}
			<div
				className={[
					"sticky top-0 z-30 flex items-center gap-3 px-5 py-3",
					"border-b border-[var(--hairline)] bg-[oklch(0.13_0.013_290/0.72)] backdrop-blur-[22px] backdrop-saturate-[1.4]",
				].join(" ")}
			>
				{/* Back pill */}
				<button
					type="button"
					onClick={onBack}
					aria-label="Card details"
					className={[
						"inline-flex items-center gap-2 shrink-0",
						"min-h-[44px] px-3 rounded-full",
						"text-[13px] text-[var(--ink-muted)] border border-[var(--border)] bg-white/[0.03]",
						"hover:text-[var(--ink)] hover:bg-white/[0.06]",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]",
						"transition-colors duration-150",
					].join(" ")}
				>
					<ArrowLeft className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
					{resolvedSetName ?? "Back"}
				</button>

				{/* Card name */}
				<span className="text-[13px] text-[var(--faint)]">
					<b className="text-[var(--ink)] font-semibold">{cardName}</b>
				</span>

				<span className="flex-1" />

				{/* #N chip */}
				{resolvedCardNumber && (
					<span className="font-mono text-[11px] text-[var(--ink-muted)] px-2.5 py-1 rounded-full border border-[var(--hairline)]">
						#{resolvedCardNumber}
					</span>
				)}
			</div>

			{/* ── 2-column body ────────────────────────────────────────────────── */}
			<div
				className={[
					"relative z-10",
					"grid gap-6 p-5 md:p-7",
					// 2-column on md+: fixed left ~330px, right fills remaining space
					"grid-cols-1 md:grid-cols-[minmax(300px,340px)_1fr]",
					"items-start",
				].join(" ")}
			>
				{/* ── LEFT: holo hero + meta + prices ─────────────────────────── */}
				{holo && card ? (
					<div className="md:sticky md:top-[72px] flex flex-col gap-4">
						{/* Holo card hero */}
						<ClientOnly
							fallback={
								<img
									src={card.imageUrl}
									alt={card.name}
									className="w-full rounded-xl"
								/>
							}
						>
							<HoloCard
								imageUrl={card.imageUrl}
								name={card.name}
								rarity={card.rarity}
								subtypes={card.subtypes}
								supertype={card.supertype}
								setId={card.setId}
								series={card.setSeries}
								cardNumber={card.cardNumber}
								size="focus"
								className="w-full"
							/>
						</ClientOnly>

						{/* Card meta */}
						<div className="flex flex-col gap-2">
							<div className="font-display text-[22px] font-semibold leading-tight text-[var(--ink)]">
								{card.name}
							</div>
							<div className="font-mono text-[12px] text-[var(--ink-muted)]">
								{[
									card.setName,
									card.cardNumber ? `#${card.cardNumber}` : undefined,
									card.types?.join(" / "),
								]
									.filter(Boolean)
									.join(" · ")}
							</div>
							{card.rarity && (
								<Badge variant="default" className="self-start">
									✦ {card.rarity}
								</Badge>
							)}
						</div>

						{/* Prices */}
						<CardPrices card={card} />
					</div>
				) : /* Fallback left col: thumbnail only (legacy / no full card data) */
				imageUrl ? (
					<div className="md:sticky md:top-[72px]">
						<img
							src={imageUrl}
							alt=""
							aria-hidden="true"
							className="w-full rounded-xl shadow-md object-contain"
						/>
					</div>
				) : null}

				{/* ── RIGHT: copy manager ─────────────────────────────────────── */}
				<GlassPanel className="overflow-hidden">
					{/* Manager header */}
					<div className="flex items-center justify-between px-5 py-4 border-b border-[var(--hairline)]">
						<h2 className="font-display text-[19px] font-medium text-[var(--ink)] flex items-center gap-2">
							Your copies
						</h2>
					</div>
					<div className="p-5">
						<CopyManager cardId={cardId} variants={resolvedVariants} />
					</div>
				</GlassPanel>
			</div>
		</div>
	);
}
