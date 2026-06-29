import { ClientOnly } from "@tanstack/react-router";
import { Layers } from "lucide-react";
import type { CSSProperties } from "react";
import { Badge } from "@/components/ui/badge";
import { GlassPanel } from "@/components/ui/glass";
import { cn } from "@/lib/utils";
import type { CardTab } from "../../lib/card-route";
import { PRICING_ENABLED } from "../../lib/pricing-flag";
import type { FocusCardData } from "../../server/card-mappers";
import { useIsOwned } from "../../store/userland/selectors";
import { addStack } from "../../store/userland/userland-store";
import { getCardAccent, getReadableAccent } from "../../utils/card-colors";
import { StackManager } from "../collection/stack-manager";
import { HoloCard, holoCardProps } from "../holo-card";
import { CardCrossLinks, type CrossLink } from "../islands/cross-links";
import { CardInfo, describeCard } from "./card-info";
import { CardPricingTab } from "./card-pricing-tab";
import { CardTabs } from "./card-tabs";
import { toHoloCardData } from "./to-holo";

const ID_BASE = "card";

export function CardCockpit({
	card,
	crossLinks,
	tab: rawTab,
	onTabChange,
	pending,
}: {
	card: FocusCardData;
	crossLinks: CrossLink[];
	tab: CardTab;
	onTabChange: (t: CardTab) => void;
	pending?: boolean;
}) {
	// When pricing is disabled the pricing tab is not rendered (CardTabs hides it).
	// Coerce any incoming "pricing" tab to "details" so the /prices route shows
	// the details pane instead of a blank tab-less panel.
	const tab: CardTab = !PRICING_ENABLED && rawTab === "pricing" ? "details" : rawTab;
	const holo = toHoloCardData(card);
	const accent = getReadableAccent(getCardAccent(card.types));
	const variants = holo.variants;
	return (
		<div className="@container" style={{ "--accent": accent } as CSSProperties}>
			{/* Header: tabs hard-left. The close (X) sits at the dialog's top-right
			    in the overlay; the right padding clears it so the tabs never run
			    under it (and is harmless on the cold-load page, which has no X). */}
			<div className="flex items-center border-b border-white/[0.07] px-5 py-3 pr-14 @3xl:px-6 @3xl:pr-16">
				<CardTabs tab={tab} onChange={onTabChange} idBase={ID_BASE} />
			</div>

			{/* Body: persistent rail + swappable pane */}
			<div className="flex flex-col gap-6 p-5 @3xl:flex-row @3xl:items-start @3xl:gap-8 @3xl:p-6">
				{/* Rail (persistent) */}
				<div className="shrink-0 @3xl:sticky @3xl:top-6">
					<div className="mx-auto flex w-full max-w-[240px] flex-col gap-4 @3xl:mx-0 @3xl:w-[200px] @3xl:max-w-none">
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
								{...holoCardProps(card)}
								size="focus"
								className="w-full"
							/>
						</ClientOnly>
						<div className="flex flex-col gap-1.5">
							<h2 className="font-display text-[22px] font-semibold leading-tight text-[var(--ink)]">
								{card.name}
							</h2>
							<div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">
								{card.setName} · #{card.cardNumber}
							</div>
							{card.rarity ? (
								<Badge variant="default" className="mt-0.5 self-start">
									✦ {card.rarity}
								</Badge>
							) : null}
						</div>
						<CollectionButton
							cardId={card.id}
							onManage={() => onTabChange("collection")}
						/>
					</div>
				</div>

				{/* Pane (swaps per tab) */}
				<div
					role="tabpanel"
					id={`${ID_BASE}-panel-${tab}`}
					aria-labelledby={`${ID_BASE}-tab-${tab}`}
					className="min-w-0 flex-1"
				>
					{tab === "details" ? (
						<>
							{/* Descriptor + HP header (moved here from the rail so the
							    Details pane leads with card context above ATTACKS). */}
							<div className="mb-4 flex flex-wrap items-baseline gap-x-2 border-b border-white/[0.07] pb-3 font-display text-sm text-[var(--ink-muted)]">
								<span>{describeCard(card)}</span>
								{card.hp ? (
									<span className="font-mono text-[12px]">
										· <b className="text-[color:var(--primary)]">{card.hp}</b>{" "}
										HP
									</span>
								) : null}
							</div>
							<CardInfo
								card={card}
								showHeader={false}
								pending={pending}
								footer={<CardCrossLinks links={crossLinks} />}
							/>
						</>
					) : tab === "collection" ? (
						<GlassPanel className="min-w-0 overflow-hidden p-5">
							<StackManager cardId={card.id} variants={variants} />
						</GlassPanel>
					) : (
						<CardPricingTab card={card} pending={pending} />
					)}
				</div>
			</div>
		</div>
	);
}

function CollectionButton({
	cardId,
	onManage,
}: {
	cardId: string;
	onManage: () => void;
}) {
	const owned = useIsOwned(cardId);
	const base = cn(
		"flex w-full items-center justify-center gap-2 rounded-[var(--r-control)] py-3 min-h-[44px]",
		"font-mono text-[13px] tracking-[0.04em] transition-colors",
		"border border-white/15 text-[var(--ink)] hover:border-white/30 cursor-pointer",
	);
	if (owned) {
		return (
			<button
				type="button"
				onClick={onManage}
				aria-label="Manage Collection"
				className={base}
			>
				<Layers className="h-4 w-4 shrink-0" aria-hidden="true" />
				Manage Collection
			</button>
		);
	}
	return (
		<button
			type="button"
			onClick={() => void addStack(cardId)}
			aria-label="Add to Vault"
			className={base}
		>
			＋ Add to Vault
		</button>
	);
}
