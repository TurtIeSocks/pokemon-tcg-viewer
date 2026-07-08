import { ClientOnly, Link } from "@tanstack/react-router";
import { type CSSProperties, useEffect, useState } from "react";
import { cardImage } from "@/lib/card-image";
import type { CardTab } from "../../lib/card-route";
import { hasReverseVariant } from "../../lib/card-variants";
import { LIST_SEARCH_DEFAULTS } from "../../lib/list-search";
import { PRICING_ENABLED } from "../../lib/pricing-flag";
import type { FocusCardData } from "../../server/card-mappers";
import { resolveCardAcrossRegions } from "../../store/corpus/corpus-engine";
import { useCorpusRuntime } from "../../store/corpus/corpus-runtime";
import {
	useActiveI18n,
	useEnsureI18n,
} from "../../store/corpus/i18n-active-hooks";
import { getCardAccent, getReadableAccent } from "../../utils/card-colors";
import { StackManager } from "../collection/stack-manager";
import { HoloCard, type HoloCardData, holoCardProps } from "../holo-card";
import { CardCrossLinks, type CrossLink } from "../islands/cross-links";
import { CardHeading, CardInfo } from "./card-info";
import { CardLightbox } from "./card-lightbox";
import { CardPricingTab } from "./card-pricing-tab";
import { CardTabs } from "./card-tabs";
import { toHoloCardData } from "./to-holo";

const ID_BASE = "card";

export function CardCockpit({
	card,
	tab: rawTab,
	onTabChange,
	pending,
}: {
	card: FocusCardData;
	tab: CardTab;
	onTabChange: (t: CardTab) => void;
	pending?: boolean;
}) {
	// When pricing is disabled the pricing tab is not rendered (CardTabs hides it).
	// Coerce any incoming "pricing" tab to "details" so the /prices route shows
	// the details pane instead of a blank tab-less panel.
	const tab: CardTab =
		!PRICING_ENABLED && rawTab === "pricing" ? "details" : rawTab;
	// Localize the detail card's NAME (overlay) + IMAGE (cardImage) for the active
	// display language carried from the grid the user opened this from (else the
	// profile default). The structured ability/attack/flavor text stays English
	// (the detail blob is EN-only — that needs per-language detail data).
	useEnsureI18n();
	const i18n = useActiveI18n();
	// Image source of truth = the CORPUS card, not this live-fetched FocusCardData.
	// The live TCGdex fetch derives a pokemontcg.io fallback for cards with no native
	// scan; the corpus holds the authoritative image (the tcgcsv JP overlay fill, the
	// ptcg hi-res for west, or a deliberate blank). Prefer it so the focus view
	// matches the grid; fall back to the FocusCardData only when the card's region
	// corpus isn't loaded (e.g. SSR before hydration).
	const indices = useCorpusRuntime((s) => s.indices);
	const imageSource = resolveCardAcrossRegions(card.id, indices) ?? card;
	const { imageUrl, imageUrlSmall } = cardImage(
		imageSource,
		i18n?.lang ?? "en",
	);
	const holo: HoloCardData = {
		...toHoloCardData(card),
		name: i18n?.namesById?.get(card.id) ?? card.name,
		imageUrl,
		imageUrlSmall,
		// Reconcile a localized 404 back to the baked image (a language may lack an
		// image the base has), matching the grid's hydrateCard behaviour.
		imageUrlFallback:
			imageUrl !== imageSource.imageUrl ? imageSource.imageUrl : undefined,
	};
	const accent = getReadableAccent(getCardAccent(card.types));
	const variants = holo.variants;
	// Printing toggle: flip the art rail between the standard printing and the
	// reverse holo when the card was printed in both. Ephemeral view state —
	// reset when the modal swipes to another card.
	const canReverse = hasReverseVariant(variants);
	const [showReverse, setShowReverse] = useState(false);
	// Click-to-enlarge: the focus card opens a full-bleed hi-res zoom for close
	// inspection. Reset both view-state flags when the modal swipes to another card.
	const [zoomOpen, setZoomOpen] = useState(false);
	// biome-ignore lint/correctness/useExhaustiveDependencies: card.id is the intended reset trigger.
	useEffect(() => {
		setShowReverse(false);
		setZoomOpen(false);
	}, [card.id]);
	return (
		<div className="@container" style={{ "--accent": accent } as CSSProperties}>
			{/* Persistent card-art rail + a folder: organizer tabs opening onto a
			    pane of glass (the active tab's cap merges into the pane below). */}
			<div className="flex flex-col gap-6 p-2 @3xl:flex-row @3xl:items-stretch @3xl:gap-8">
				{/* Rail (persistent art) */}
				<div className="shrink-0 @3xl:sticky @3xl:top-6">
					<div className="mx-auto flex w-full max-w-80 flex-col gap-4 @3xl:mx-0 @3xl:w-70 @3xl:max-w-none">
						<ClientOnly
							fallback={
								<img
									src={holo.imageUrl}
									alt={holo.name}
									className="w-full rounded-xl"
								/>
							}
						>
							<HoloCard
								{...holoCardProps(holo)}
								reverse={canReverse && showReverse}
								size="focus"
								className="w-full cursor-zoom-in"
								onClick={() => setZoomOpen(true)}
							/>
						</ClientOnly>
						{canReverse && (
							<ClientOnly fallback={null}>
								<div
									role="group"
									aria-label="Printing"
									className="inline-flex self-center rounded-[var(--r-pill)] border border-white/10 bg-white/[0.05] p-0.5 backdrop-blur-sm"
								>
									{(
										[
											[false, "Standard"],
											[true, "Reverse Holo"],
										] as const
									).map(([isReverse, label]) => (
										<button
											key={label}
											type="button"
											aria-pressed={showReverse === isReverse}
											onClick={() => setShowReverse(isReverse)}
											className={`rounded-[var(--r-pill)] px-3 py-1 font-mono text-[0.65rem] uppercase tracking-[0.08em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] ${
												showReverse === isReverse
													? "bg-[var(--primary-wash)] text-[var(--primary-ink)]"
													: "text-[var(--ink-muted)] hover:text-[var(--ink)]"
											}`}
										>
											{label}
										</button>
									))}
								</div>
							</ClientOnly>
						)}
					</div>
				</div>

				{/* Folder: tabs (caps) + the pane (folder body) they open onto. At
				    @3xl the folder fills the card-art height exactly — the column is
				    stretched to the row (whose only height contributor is the art),
				    its contents are absolutely positioned so they never drive that
				    height, and the pane flex-fills + scrolls within it. */}
				<div className="min-w-0 flex-1 @3xl:relative">
					<div className="flex flex-col @3xl:absolute @3xl:inset-0">
						<CardTabs tab={tab} onChange={onTabChange} idBase={ID_BASE} />
						<div
							role="tabpanel"
							id={`${ID_BASE}-panel-${tab}`}
							aria-labelledby={`${ID_BASE}-tab-${tab}`}
							className="-mt-px min-w-0 rounded-tr-[var(--r-panel)] rounded-b-[var(--r-panel)] border border-white/12 bg-[var(--glass-2)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.10),inset_0_-1px_0_rgba(0,0,0,0.30)] backdrop-blur-xl @3xl:min-h-0 @3xl:flex-1 @3xl:overflow-y-auto"
						>
							{tab === "details" ? (
								<CardInfo card={card} pending={pending} />
							) : tab === "collection" ? (
								<StackManager
									cardId={card.id}
									variants={variants}
									variantsDetailed={card.variantsDetailed}
								/>
							) : (
								<CardPricingTab card={card} pending={pending} />
							)}
						</div>
					</div>
				</div>
			</div>
			<ClientOnly fallback={null}>
				<CardLightbox
					open={zoomOpen}
					onClose={() => setZoomOpen(false)}
					src={holo.imageUrl}
					alt={holo.name}
				/>
			</ClientOnly>
		</div>
	);
}

/**
 * Full-page (cold-load / shared-link) card view: the dedicated-route counterpart
 * to {@link CardModal}. Renders the same identity header + cockpit + cross-links
 * footer the modal does, minus the dialog chrome, so `/$card`, `/manage` and
 * `/prices` all stay complete and in sync. `series`/`set` build the back link.
 */
export function CardPageView({
	card,
	crossLinks,
	tab,
	onTabChange,
	series,
	set,
}: {
	card: FocusCardData;
	crossLinks: CrossLink[];
	tab: CardTab;
	onTabChange: (t: CardTab) => void;
	series: string;
	set: string;
}) {
	return (
		<div className="mx-auto w-full max-w-4xl overflow-y-auto px-4 py-6">
			<div className="mb-3">
				<Link
					to="/$series/$set"
					params={{ series, set }}
					search={LIST_SEARCH_DEFAULTS}
					className="font-mono text-xs tracking-[0.03em] text-[var(--ink-muted)] no-underline transition-colors hover:text-[color:var(--primary)]"
				>
					← {card.setName}
				</Link>
			</div>
			<div className="rounded-[var(--r-panel)] border border-white/10 bg-[var(--glass-tint)] p-5 shadow-[var(--shadow)] backdrop-blur-2xl">
				<CardHeading card={card} />
				<div className="mt-4">
					<CardCockpit card={card} tab={tab} onTabChange={onTabChange} />
				</div>
				{crossLinks.length > 0 ? (
					<div className="mt-2 border-t border-white/[0.07] pt-3">
						<CardCrossLinks links={crossLinks} />
					</div>
				) : null}
			</div>
		</div>
	);
}
