import { useEffect } from "react";
import { usePricesRuntime } from "../corpus/prices-runtime";
import { useCollectionStats } from "./stats";
import { captureSnapshot } from "./userland-store";

/**
 * Capture a daily portfolio snapshot when a new price blob lands and the
 * portfolio market value is known. captureSnapshot dedups by the blob date, so
 * re-renders and repeated mounts never double-capture. Mounted by the vault.
 */
export function useCaptureSnapshot(): void {
	const date = usePricesRuntime((s) => s.meta?.date ?? null);
	const { marketValue, valueCurrency, cardsOwned } = useCollectionStats();
	useEffect(() => {
		if (!date || marketValue === null) return;
		captureSnapshot({
			priceDate: date,
			totalCents: marketValue,
			currency: valueCurrency,
			cardCount: cardsOwned,
		});
	}, [date, marketValue, valueCurrency, cardsOwned]);
}
