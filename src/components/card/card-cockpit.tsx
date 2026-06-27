import { ClientOnly } from "@tanstack/react-router";
import { Layers } from "lucide-react";
import type { CSSProperties } from "react";
import { Badge } from "@/components/ui/badge";
import { GlassPanel } from "@/components/ui/glass";
import { cn } from "@/lib/utils";
import type { CardTab } from "../../lib/card-route";
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
	tab,
	onTabChange,
	pending,
}: {
	card: FocusCardData;
	crossLinks: CrossLink[];
	tab: CardTab;
	onTabChange: (t: CardTab) => void;
	pending?: boolean;
}) {
	const holo = toHoloCardData(card);
	const accent = getReadableAccent(getCardAccent(card.types));
	const variants = holo.variants;
	return (
		<div className="@container" style={{ "--accent": accent } as CSSProperties}>
			{/* Header: breadcrumb + tabs */}
			<div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-3 @3xl:px-6">
				<span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">
					{card.setName} · #{card.cardNumber}
				</span>
				<CardTabs tab={tab} onChange={onTabChange} idBase={ID_BASE} />
			</div>

			{/* Body: persistent rail + swappable pane */}
			<div className="flex flex-col gap-6 p-5 @3xl:flex-row @3xl:items-start @3xl:gap-8 @3xl:p-6">
				{/* Rail (persistent) */}
				<div className="shrink-0 @3xl:sticky @3xl:top-6">
					<div className="flex w-full flex-col gap-4 @3xl:w-[200px]">
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
							<div className="font-display text-sm text-[var(--ink-muted)]">
								{describeCard(card)}
							</div>
							<div className="flex items-center gap-2">
								{card.hp ? (
									<span className="font-mono text-[12px] text-[var(--ink-muted)]">
										<b className="text-[color:var(--primary)]">{card.hp}</b> HP
									</span>
								) : null}
								{card.rarity ? (
									<Badge variant="default">✦ {card.rarity}</Badge>
								) : null}
							</div>
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
						<CardInfo
							card={card}
							showHeader={false}
							pending={pending}
							footer={<CardCrossLinks links={crossLinks} />}
						/>
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
