import { useRouter } from "@tanstack/react-router";
import type React from "react";
import { useCallback } from "react";
import { cardManageLinkPropsFor, cardRouteParams } from "../../lib/card-route";
import { faceLanguageFor } from "../../lib/languages";
import { useSlugIndex } from "../../store/corpus/corpus-runtime";
import { useDisplayLanguage } from "../../store/corpus/i18n-active-hooks";
import { useIsOwned, useOwnedCount } from "../../store/userland/selectors";
import { addStack } from "../../store/userland/userland-store";
import type { HoloCardData } from "../holo-card";

/** State + activation for the shared owned/add control. */
export interface CollectionToggleState {
	/** Whether the user owns at least one stack of this card. */
	owned: boolean;
	/** Total copies owned across all stacks (0 when not owned). */
	count: number;
	/**
	 * Activate the control. Not owned → add a copy to the Vault. Owned → open the
	 * card's stack-manager face (masked overlay). Calls `preventDefault` so the
	 * button never triggers an enclosing card `<Link>`.
	 */
	activate: (e: React.MouseEvent | React.KeyboardEvent) => void;
}

/**
 * Single source of truth for the "add to / manage in collection" behaviour,
 * shared by {@link CollectionToggle} and the unified card mini-nav so the store
 * writes (addStack) and the owned → manage navigation live in exactly one place.
 *
 * S3: reads owned/count via the per-card primitive selectors in the component
 * that renders the control, so a card re-renders only when *its own* ownership
 * changes.
 */
export function useCollectionToggle(card: HoloCardData): CollectionToggleState {
	const owned = useIsOwned(card.id);
	const count = useOwnedCount(card.id);
	const router = useRouter();
	const slugIndex = useSlugIndex();
	const displayLanguage = useDisplayLanguage();
	// A Japanese-lineage card has no English face (and vice versa) -- resolve the
	// link's language by the card's region, not blindly by the active display
	// language, so an owned asia card opens in its own face.
	const linkLanguage = faceLanguageFor(card, displayLanguage);

	const activate = useCallback(
		(e: React.MouseEvent | React.KeyboardEvent) => {
			e.preventDefault();
			if (owned) {
				const p = slugIndex ? cardRouteParams(slugIndex, card) : null;
				if (p) {
					void router.navigate({
						...cardManageLinkPropsFor(p, linkLanguage),
					});
				}
				return;
			}
			void addStack(card.id);
		},
		[owned, slugIndex, card, router, linkLanguage],
	);

	return { owned, count, activate };
}
