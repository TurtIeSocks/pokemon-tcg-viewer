import { useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useReducer } from "react";
import {
	getCardDetail,
	optimisticCardFromCorpus,
	parseCardOverlayParam,
	peekCardDetail,
} from "../../lib/card-detail";
import { toSupportedLanguage } from "../../lib/languages";
import { useStore } from "../../store";
import {
	useCorpusRuntime,
	useSlugIndex,
} from "../../store/corpus/corpus-runtime";
import { useDetailRuntime } from "../../store/corpus/detail-runtime";
import {
	useActiveI18n,
	useEnsureI18n,
} from "../../store/corpus/i18n-active-hooks";
import { setsForRegion } from "../../store/sets-slice";
import { CardModal } from "./card-modal";

function detailHasCard(
	detailById: Map<string, unknown> | null,
	card: { id: string } | null,
): boolean {
	return Boolean(card && detailById?.has(card.id));
}

/**
 * Root-level card overlay. When history state carries a `cardOverlay` target
 * ("series/set/slug", set by in-app card links with the URL masked to
 * /$series/$set/$card), show it as a modal over the current page. The grid
 * behind stays mounted because the active route never changed — only history
 * state did. Closing pops that history entry, back to the grid. A cold load of
 * the masked URL has no such state, so it falls through to the full-page $card
 * route instead.
 *
 * Two-stage render so the modal is never blank: it mounts IMMEDIATELY from the
 * in-memory corpus (image, name, set — no network), then swaps in the full
 * detail (battle stats, prices, cross-links) when `getCardDetail` resolves. The
 * focus art therefore starts loading in parallel with the RPC instead of after
 * it. `getCardDetail` caches per card, so a re-open (or a hover-prefetched card)
 * skips the round trip entirely.
 */
export function CardOverlay() {
	const cardParam = useRouterState({
		select: (s) => s.location.state.cardOverlay,
	});
	const cardTab = useRouterState({
		select: (s) => s.location.state.cardTab,
	});
	const router = useRouter();
	const slugIndex = useSlugIndex();
	const index = useCorpusRuntime((s) => s.index);
	const activeRegion = useCorpusRuntime((s) => s.activeRegion);
	// The active-region sets, to match the active-region `index` above -- a bare
	// west-only `s.sets` would leave an asia card overlay without its set
	// metadata (name/series/date) and derived image.
	const sets = useStore((s) => setsForRegion(s, activeRegion) ?? null);
	const detailById = useDetailRuntime((s) => s.detailById);
	useEnsureI18n();
	const i18n = useActiveI18n();
	const lang = toSupportedLanguage(i18n?.lang);

	const params = useMemo(() => parseCardOverlayParam(cardParam), [cardParam]);

	// Instant, network-free card from the corpus — shown until detail arrives.
	// When the offline blob is present, also includes battle fields immediately.
	const optimistic = useMemo(
		() =>
			params
				? optimisticCardFromCorpus(
						params,
						slugIndex,
						index,
						sets,
						detailById,
						i18n,
					)
				: null,
		[params, slugIndex, index, sets, detailById, i18n],
	);

	// Kick the RPC for any card whose detail isn't already settled, and re-render
	// when it lands. `peekCardDetail` (read at render below) is the source of
	// truth, so a warm/prefetched card resolves synchronously with no loading flash.
	const [, forceTick] = useReducer((x: number) => x + 1, 0);
	useEffect(() => {
		if (!params || peekCardDetail(params, lang) !== undefined) return;
		let cancelled = false;
		getCardDetail(params, lang).finally(() => {
			if (!cancelled) forceTick();
		});
		return () => {
			cancelled = true;
		};
	}, [params, lang]);

	if (!cardParam || !params) return null;
	const settled = peekCardDetail(params, lang); // value | null = settled; undefined = in flight
	const detail = settled ?? null;
	// Prefer the full detail once it lands; fall back to the optimistic corpus
	// card meanwhile. Null only when neither the corpus nor the server has it.
	const card = detail?.card ?? optimistic;
	if (!card) return null;
	// Showing the optimistic card while the RPC is still in flight → ghost the
	// detail-only sections (stats, prices) so the gap reads as loading.
	// When the offline blob already covers this card, battle data is present
	// immediately — suppress the ghost (prices still fill in via the RPC).
	const pending =
		settled === undefined && !detailHasCard(detailById, optimistic);
	return (
		<CardModal
			card={card}
			crossLinks={detail?.crossLinks ?? []}
			tab={cardTab ?? "details"}
			pending={pending}
			onClose={() => router.history.back()}
		/>
	);
}
