import { ClientOnly } from "@tanstack/react-router";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { FocusCardData } from "../../server/card-mappers";
import { useIsOwned } from "../../store/userland/selectors";
import {
	addCopy,
	removeAllCopiesOfCard,
} from "../../store/userland/userland-store";
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
 */
export function CardDetail({
	card,
	crossLinks,
}: {
	card: FocusCardData;
	crossLinks: CrossLink[];
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
							"radial-gradient(120% 60% at 50% 0%, color-mix(in oklab, var(--accent,#c9a86a) 8%, transparent), transparent 55%), #131215",
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
							<CollectionButton card={holo} />
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
}: {
	card: ReturnType<typeof toHoloCardData>;
}) {
	const owned = useIsOwned(card.id);
	return (
		<button
			type="button"
			onClick={() =>
				owned ? void removeAllCopiesOfCard(card.id) : void addCopy(card.id)
			}
			className={cn(
				"w-full rounded-[10px] py-2.5 text-center font-mono text-[13px] tracking-[0.04em] transition-colors",
				owned
					? "bg-[color:var(--accent,#c9a86a)] font-bold text-[#1a1206]"
					: "border border-white/15 text-[#e7e3d8] hover:border-white/30",
			)}
		>
			{owned ? "✓ In collection" : "＋ Add to collection"}
		</button>
	);
}
