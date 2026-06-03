import { ClientOnly } from "@tanstack/react-router";
import { Layers } from "lucide-react";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { FocusCardData } from "../../server/card-mappers";
import { useIsOwned } from "../../store/userland/selectors";
import { addCopy } from "../../store/userland/userland-store";
import { getCardAccent, getReadableAccent } from "../../utils/card-colors";
import { HoloCard } from "../holo-card";
import { CardPrices } from "../islands/card-prices";
import { CardCrossLinks, type CrossLink } from "../islands/cross-links";
import { CardInfo } from "./card-info";
import { toHoloCardData } from "./to-holo";

/**
 * Presentation-agnostic card detail body (art + info + prices + cross-links).
 * Rendered inside a Dialog for the in-app overlay (CardModal) and inside a page
 * layout for a cold-loaded / shared card URL ($card route). Keeping it wrapper-
 * free means both presentations share one implementation.
 *
 * @param onManage - Optional callback invoked when the user clicks "Manage
 *   Collection" on an owned card. When omitted the button is rendered disabled.
 *   CardModal supplies a replace-navigate; the cold-load $card route supplies a
 *   push-navigate; tests pass a mock.
 */
export function CardDetail({
	card,
	crossLinks,
	onManage,
}: {
	card: FocusCardData;
	crossLinks: CrossLink[];
	/** Called when the user activates "Manage Collection". Disabled when absent. */
	onManage?: () => void;
}) {
	const holo = toHoloCardData(card);
	const accent = getReadableAccent(getCardAccent(card.types));
	return (
		<div
			className="flex flex-col gap-6 p-6 md:flex-row md:items-stretch md:gap-8 md:p-8"
			style={{ "--accent": accent } as CSSProperties}
		>
			<div className="shrink-0 self-stretch">
				<div
					className="h-full rounded-2xl border border-white/[0.06] p-5"
					style={{
						background:
							"radial-gradient(120% 60% at 50% 0%, color-mix(in oklab, var(--primary) 8%, transparent), transparent 55%), var(--bg)",
					}}
				>
					<div className="flex flex-col items-center md:sticky md:top-8">
						<div className="flex w-[180px] flex-col gap-4 md:w-[212px]">
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
								/>
							</ClientOnly>
							<CollectionButton card={holo} onManage={onManage} />
						</div>
					</div>
				</div>
			</div>

			<CardInfo
				card={card}
				footer={
					<>
						<CardPrices card={card} />
						<CardCrossLinks links={crossLinks} />
					</>
				}
			/>
		</div>
	);
}

function CollectionButton({
	card,
	onManage,
}: {
	card: ReturnType<typeof toHoloCardData>;
	/** Callback for "Manage Collection". Disabled when absent. */
	onManage?: () => void;
}) {
	const owned = useIsOwned(card.id);

	if (owned) {
		const baseClass = cn(
			"flex w-full items-center justify-center gap-2 rounded-[10px] py-3 min-h-[44px]",
			"font-mono text-[13px] tracking-[0.04em] transition-colors",
			"border border-white/15 text-[var(--ink)]",
		);

		return (
			<button
				type="button"
				onClick={onManage}
				disabled={!onManage}
				aria-label="Manage Collection"
				className={cn(
					baseClass,
					onManage
						? "hover:border-white/30 cursor-pointer"
						: "opacity-50 cursor-not-allowed",
				)}
			>
				<Layers className="h-4 w-4 shrink-0" aria-hidden="true" />
				Manage Collection
			</button>
		);
	}

	return (
		<button
			type="button"
			onClick={() => void addCopy(card.id)}
			className={cn(
				"w-full rounded-[10px] py-2.5 text-center font-mono text-[13px] tracking-[0.04em] transition-colors",
				"border border-white/15 text-[var(--ink)] hover:border-white/30",
			)}
		>
			＋ Add to collection
		</button>
	);
}
