import { useNavigate, useRouter } from "@tanstack/react-router";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import type { ListSearch } from "../../lib/card-query";
import {
	type CardTab,
	cardRouteParams,
	cardTabLinkPropsFor,
} from "../../lib/card-route";
import type { FocusCardData } from "../../server/card-mappers";
import { useSlugIndex } from "../../store/corpus/corpus-runtime";
import {
	isI18nFallback,
	useActiveI18n,
} from "../../store/corpus/i18n-active-hooks";
import { CardCockpit } from "../card/card-cockpit";
import { CardHeading } from "../card/card-info";
import { CardLanguageControl } from "./card-language-control";
import { CardCrossLinks, type CrossLink } from "./cross-links";

/**
 * Language picker + fallback notice wired to the active route's `lang` search
 * param. Works for both the history-state overlay (CardOverlay) and the cold
 * $card route: useNavigate patches `lang` on the current route in both cases,
 * and useEnsureI18n (called inside CardCockpit) re-localizes on the new param.
 */
function ModalLangControl({ cardId }: { cardId: string }) {
	const navigate = useNavigate();
	const i18n = useActiveI18n();
	const lang = i18n?.lang ?? "en";
	const isFallback = isI18nFallback(i18n, cardId);
	return (
		<div className="flex items-center gap-2">
			<CardLanguageControl
				value={{ lang: lang === "en" ? null : lang } as ListSearch}
				onChange={(patch) =>
					void navigate({
						to: ".",
						search: (prev) => ({ ...prev, lang: patch.lang ?? null }),
						replace: true,
					})
				}
			/>
			{isFallback ? (
				<span className="font-mono text-[11px] text-[var(--ink-muted)]">
					Shown in English.
				</span>
			) : null}
		</div>
	);
}

interface CardModalProps {
	card: FocusCardData;
	crossLinks: CrossLink[];
	onClose: () => void;
	tab: CardTab;
	pending?: boolean;
}

export function CardModal({
	card,
	crossLinks,
	onClose,
	tab,
	pending,
}: CardModalProps) {
	const router = useRouter();
	const slugIndex = useSlugIndex();
	const p = slugIndex ? cardRouteParams(slugIndex, card) : null;

	const onTabChange = (next: CardTab) => {
		if (!p) return;
		void router.navigate({ ...cardTabLinkPropsFor(p, next), replace: true });
	};

	return (
		<Dialog open onOpenChange={(o) => !o && onClose()}>
			<DialogContent
				aria-describedby={undefined}
				className="max-w-4xl sm:max-w-4xl"
			>
				{/* Radix needs a DialogTitle for the dialog's accessible name; the
				    visible identity is CardHeading (shared with the dedicated page). */}
				<DialogTitle className="sr-only">
					{card.name} · {card.setName}
				</DialogTitle>
				<DialogHeader>
					<CardHeading card={card} />
					<ModalLangControl cardId={card.id} />
				</DialogHeader>
				<div className="max-h-[90vh] overflow-y-auto">
					<CardCockpit
						card={card}
						tab={tab}
						onTabChange={onTabChange}
						pending={pending}
					/>
				</div>
				<DialogFooter>
					<CardCrossLinks links={crossLinks} />
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
