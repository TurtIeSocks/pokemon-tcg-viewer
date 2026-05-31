import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useStore } from "../../store";
import { rollPack } from "../../utils/roll-pack";
import { BoosterPack } from "../booster-pack";
import { CollectionToggle } from "../collection-toggle";
import { HoloCard, type HoloCardData } from "../holo-card";

const RIP_DURATION_MS = 320;

export function PackDialog() {
	const { setId } = useParams<{ setId: string }>();
	const navigate = useNavigate();
	const location = useLocation();
	const sets = useStore((s) => s.sets);
	const pool = useStore((s) => (setId ? s.packCards[setId] : undefined));
	const loadPackCards = useStore((s) => s.loadPackCards);
	const ownedMap = useStore((s) => s.owned);
	const set = sets?.find((x) => x.id === setId);

	const [ripped, setRipped] = useState(false);
	const [pack, setPack] = useState<HoloCardData[] | null>(null);
	const ripTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (setId) loadPackCards(setId);
	}, [setId, loadPackCards]);

	// Clear a pending rip reveal if the dialog unmounts mid-animation.
	useEffect(
		() => () => {
			if (ripTimer.current) clearTimeout(ripTimer.current);
		},
		[],
	);

	const close = () => {
		if (location.key === "default") navigate("/");
		else navigate(-1);
	};
	const onRip = () => {
		if (!pool || pool.length === 0) return;
		setRipped(true);
		if (ripTimer.current) clearTimeout(ripTimer.current);
		ripTimer.current = setTimeout(
			() => setPack(rollPack({ pool })),
			RIP_DURATION_MS,
		);
	};
	const onReroll = () => {
		if (ripTimer.current) clearTimeout(ripTimer.current);
		setRipped(false);
		setPack(null);
	};

	return (
		<Dialog open onOpenChange={(o) => !o && close()}>
			<DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
				<DialogTitle>
					{set ? `Open a ${set.name} pack` : "Open a pack"}
				</DialogTitle>
				{!set ? (
					<p className="text-sm text-muted-foreground">
						No set with id "{setId}".
					</p>
				) : !pack ? (
					<div className="flex justify-center py-6">
						<BoosterPack set={set} ripped={ripped} onRip={onRip} />
					</div>
				) : (
					<>
						<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
							{pack.map((card) => (
								<HoloCard
									key={card.id}
									imageUrl={card.imageUrl}
									imageUrlSmall={card.imageUrlSmall}
									name={card.name}
									rarity={card.rarity}
									subtypes={card.subtypes}
									supertype={card.supertype}
									setId={card.setId}
									cardNumber={card.cardNumber}
									owned={!!ownedMap[card.id]}
									hoverOverlay={<CollectionToggle card={card} />}
									onClick={(e) => {
										if (e.defaultPrevented) return;
										navigate(`/card/${card.id}`);
									}}
									style={{ width: "100%" }}
								/>
							))}
						</div>
						<div className="flex justify-center pt-4">
							<Button onClick={onReroll}>Open another pack</Button>
						</div>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
