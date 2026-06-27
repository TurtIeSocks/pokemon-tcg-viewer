import { ClientOnly } from "@tanstack/react-router";
import { Layers } from "lucide-react";
import type { CSSProperties } from "react";
import { GlassPanel } from "@/components/ui/glass";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { FocusCardData } from "../../server/card-mappers";
import { useIsOwned } from "../../store/userland/selectors";
import { addStack } from "../../store/userland/userland-store";
import { getCardAccent, getReadableAccent } from "../../utils/card-colors";
import { HoloCard, holoCardProps } from "../holo-card";
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
	pending,
}: {
	card: FocusCardData;
	crossLinks: CrossLink[];
	/** Called when the user activates "Manage Collection". Disabled when absent. */
	onManage?: () => void;
	/** True while the full detail is still loading (only the optimistic card is shown). */
	pending?: boolean;
}) {
	const holo = toHoloCardData(card);
	const accent = getReadableAccent(getCardAccent(card.types));
	return (
		<div
			className="flex flex-col gap-6 p-6 md:flex-row md:items-start md:gap-8 md:p-8"
			style={{ "--accent": accent } as CSSProperties}
		>
			<div className="shrink-0">
				<div
					className="rounded-2xl border border-white/[0.06] p-5"
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
								<HoloCard {...holoCardProps(card)} size="focus" />
							</ClientOnly>
							<CollectionButton card={holo} onManage={onManage} />
						</div>
					</div>
				</div>
			</div>

			{/* min-w-0 lets the info column wrap instead of overflowing the dialog */}
			<div className="min-w-0 flex-1">
				<CardInfo
					card={card}
					pending={pending}
					footer={
						pending ? (
							<PriceGhost />
						) : (
							<>
								<CardPrices card={card} />
								<CardCrossLinks links={crossLinks} />
							</>
						)
					}
				/>
			</div>
		</div>
	);
}

/** Shimmer stand-in for the price panel while the detail RPC is in flight. */
function PriceGhost() {
	return (
		<GlassPanel className="mt-2 p-3.5" aria-hidden="true">
			<div className="flex flex-col gap-2.5">
				{["a", "b"].map((k) => (
					<div key={k} className="flex items-center justify-between gap-3">
						<Skeleton className="h-3 w-20" />
						<Skeleton className="h-3 w-14" />
					</div>
				))}
			</div>
		</GlassPanel>
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
			"flex w-full items-center justify-center gap-2 rounded-[var(--r-control)] py-3 min-h-[44px]",
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
			onClick={() => void addStack(card.id)}
			className={cn(
				"w-full rounded-[var(--r-control)] py-2.5 text-center font-mono text-[13px] tracking-[0.04em] transition-colors",
				"border border-white/15 text-[var(--ink)] hover:border-white/30",
			)}
		>
			＋ Add to collection
		</button>
	);
}
