import { ClientOnly } from "@tanstack/react-router";
import type { CSSProperties } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { FocusCardData } from "../../server/card-mappers";
import { useStore } from "../../store";
import { getCardAccent, getReadableAccent } from "../../utils/card-colors";
import { CardInfo } from "../card/card-info";
import { toHoloCardData } from "../card/to-holo";
import { HoloCard } from "../holo-card";
import { CardPrices } from "./card-prices";
import { CardCrossLinks, type CrossLink } from "./cross-links";

export function CardModal({
	card,
	crossLinks,
	onClose,
}: {
	card: FocusCardData;
	crossLinks: CrossLink[];
	onClose: () => void;
}) {
	const holo = toHoloCardData(card);
	const accent = getReadableAccent(getCardAccent(card.types));
	return (
		<Dialog open onOpenChange={(o) => !o && onClose()}>
			<DialogContent
				aria-describedby={undefined}
				className="max-h-[90vh] max-w-4xl overflow-y-auto border-white/10 bg-[#0d0d0f] p-0 sm:max-w-4xl"
			>
				<DialogTitle className="sr-only">{card.name}</DialogTitle>
				<div
					className="flex flex-col gap-6 p-6 md:flex-row md:items-stretch md:gap-8 md:p-8"
					style={{ "--accent": accent } as CSSProperties}
				>
					<div className="shrink-0 self-stretch">
						<div
							className="h-full rounded-2xl border border-white/[0.06] p-5"
							style={{
								background:
									"radial-gradient(120% 60% at 50% 0%, color-mix(in oklab, var(--accent) 8%, transparent), transparent 55%), #131215",
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
			</DialogContent>
		</Dialog>
	);
}

function CollectionButton({
	card,
}: {
	card: ReturnType<typeof toHoloCardData>;
}) {
	const owned = useStore((s) => !!s.owned[card.id]);
	const add = useStore((s) => s.addToCollection);
	const remove = useStore((s) => s.removeFromCollection);
	return (
		<button
			type="button"
			onClick={() => (owned ? remove(card.id) : add(card))}
			className={cn(
				"w-full rounded-[10px] py-2.5 text-center font-mono text-[13px] tracking-[0.04em] transition-colors",
				owned
					? "bg-[color:var(--accent)] font-bold text-[#1a1206]"
					: "border border-white/15 text-[#e7e3d8] hover:border-white/30",
			)}
		>
			{owned ? "✓ In collection" : "＋ Add to collection"}
		</button>
	);
}
