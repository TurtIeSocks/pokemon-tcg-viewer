import { useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { FocusCardData } from "../../server/card-mappers";
import { getCardForRouteFn } from "../../server/corpus-server";
import { CardModal } from "./card-modal";
import type { CrossLink } from "./cross-links";

interface Detail {
	card: FocusCardData;
	crossLinks: CrossLink[];
}

/**
 * Root-level card overlay. When history state carries a `cardOverlay` target
 * ("series/set/slug", set by in-app card links with the URL masked to
 * /$series/$set/$card), fetch the card and show it as a modal over the current
 * page. The grid behind stays mounted because the active route never changed —
 * only history state did. Closing pops that history entry, back to the grid. A
 * cold load of the masked URL has no such state, so it falls through to the
 * full-page $card route instead.
 */
export function CardOverlay() {
	const cardParam = useRouterState({
		select: (s) => s.location.state.cardOverlay,
	});
	const cardManage = useRouterState({
		select: (s) => s.location.state.cardManage,
	});
	const router = useRouter();
	const [detail, setDetail] = useState<Detail | null>(null);

	useEffect(() => {
		if (!cardParam) {
			setDetail(null);
			return;
		}
		const [series, set, card] = cardParam.split("/");
		if (!series || !set || !card) {
			setDetail(null);
			return;
		}
		let cancelled = false;
		setDetail(null);
		getCardForRouteFn({ data: { series, set, card } })
			.then((r) => {
				if (!cancelled) setDetail(r ?? null);
			})
			.catch(() => {
				if (!cancelled) setDetail(null);
			});
		return () => {
			cancelled = true;
		};
	}, [cardParam]);

	if (!cardParam || !detail) return null;
	return (
		<CardModal
			card={detail.card}
			crossLinks={detail.crossLinks}
			manage={cardManage}
			onClose={() => router.history.back()}
		/>
	);
}
