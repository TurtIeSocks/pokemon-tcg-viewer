// candidate-tray.tsx
import { MinusIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { GlassPanel } from "@/components/ui/glass";
import { useStore } from "../../store";
import { hydrateCard } from "../../store/corpus/corpus-engine";
import { useCorpusRuntime } from "../../store/corpus/corpus-runtime-store";
import type { ScanCandidate } from "../../store/scan/scan-types";
import { setsForRegion } from "../../store/sets-slice";
import { Button } from "../ui/button";

interface CandidateTrayProps {
	/** Ranked matches for the current scan, best first (see match.ts, R2). */
	candidates: ScanCandidate[];
	/** Called once the user confirms a quantity for a picked candidate. */
	onAdd(cardId: string, quantity: number): void;
}

/**
 * Ranked-match thumbnail strip. Tapping a thumb opens an inline quantity
 * stepper; confirming calls `onAdd`. Corpus/sets are read here (the actual
 * consumer of hydrated card data), not drilled in as props, per the
 * zustand-subscription-patterns skill (S3: subscribe in the consuming
 * component).
 */
export function CandidateTray({ candidates, onAdd }: CandidateTrayProps) {
	const index = useCorpusRuntime((s) => s.index);
	const activeRegion = useCorpusRuntime((s) => s.activeRegion);
	const sets = useStore((s) => setsForRegion(s, activeRegion));
	const [pickedId, setPickedId] = useState<string | null>(null);
	const [quantity, setQuantity] = useState(1);

	if (candidates.length === 0 || !index) return null;

	const setMap = new Map((sets ?? []).map((s) => [s.id, s]));

	function pick(cardId: string) {
		setPickedId(cardId);
		setQuantity(1);
	}

	function confirm() {
		if (!pickedId) return;
		onAdd(pickedId, quantity);
		setPickedId(null);
		setQuantity(1);
	}

	return (
		<GlassPanel className="flex flex-col gap-3 p-3">
			<ul className="flex gap-2 overflow-x-auto">
				{candidates.map((c) => {
					const card = index.byId.get(c.cardId);
					if (!card) return null;
					const hydrated = hydrateCard(card, setMap);
					const isPicked = pickedId === c.cardId;
					return (
						<li key={c.cardId}>
							<button
								type="button"
								onClick={() => pick(c.cardId)}
								className={`rounded-[var(--r-control)] border p-1 transition-[border-color] ${
									isPicked
										? "border-[var(--primary)]"
										: "border-[var(--border)] hover:border-[color-mix(in_oklch,var(--primary)_45%,var(--border))]"
								}`}
							>
								<img
									src={hydrated.imageUrlSmall}
									alt={hydrated.name}
									className="h-24 w-auto rounded-[var(--r-control)]"
								/>
							</button>
						</li>
					);
				})}
			</ul>

			{pickedId && (
				<div className="flex items-center justify-between gap-3">
					<div className="flex items-center gap-2">
						<Button
							type="button"
							size="icon-sm"
							variant="outline"
							aria-label="Decrease quantity"
							onClick={() => setQuantity((q) => Math.max(1, q - 1))}
						>
							<MinusIcon />
						</Button>
						<span className="w-6 text-center font-mono tabular-nums">
							{quantity}
						</span>
						<Button
							type="button"
							size="icon-sm"
							variant="outline"
							aria-label="Increase quantity"
							onClick={() => setQuantity((q) => q + 1)}
						>
							<PlusIcon />
						</Button>
					</div>
					<Button type="button" onClick={confirm}>
						Add to Vault
					</Button>
				</div>
			)}
		</GlassPanel>
	);
}
