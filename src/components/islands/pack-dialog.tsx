import { Link, type LinkProps } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { rollPack } from "../../utils/roll-pack";
import { BoosterPack, type PackArt } from "../booster-pack/booster-pack";
import { CollectionToggle } from "../collection-toggle";
import { HoloCard, type HoloCardData } from "../holo-card";

const RIP_DURATION_MS = 320;

interface PackDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	art: PackArt;
	pool: HoloCardData[];
	cardHref: (card: HoloCardData) => LinkProps;
}

export function PackDialog({
	open,
	onOpenChange,
	art,
	pool,
	cardHref,
}: PackDialogProps) {
	const [ripped, setRipped] = useState(false);
	const [pack, setPack] = useState<HoloCardData[] | null>(null);
	const ripTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Reset when the dialog closes.
	useEffect(() => {
		if (!open) {
			setRipped(false);
			setPack(null);
			if (ripTimer.current) clearTimeout(ripTimer.current);
		}
	}, [open]);

	// Clear a pending rip if unmounted mid-animation.
	useEffect(
		() => () => {
			if (ripTimer.current) clearTimeout(ripTimer.current);
		},
		[],
	);

	const onRip = () => {
		if (pool.length === 0) return;
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
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
				<DialogTitle>{`Open a ${art.name} pack`}</DialogTitle>
				{!pack ? (
					<div className="flex justify-center py-6">
						<BoosterPack art={art} ripped={ripped} onRip={onRip} />
					</div>
				) : (
					<>
						<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
							{pack.map((card) => (
								<Link key={card.id} {...cardHref(card)} className="block">
									<HoloCard
										imageUrl={card.imageUrl}
										imageUrlSmall={card.imageUrlSmall}
										name={card.name}
										rarity={card.rarity}
										subtypes={card.subtypes}
										supertype={card.supertype}
										setId={card.setId}
										series={card.setSeries}
										variants={card.variants}
										cardNumber={card.cardNumber}
										hoverOverlay={<CollectionToggle card={card} />}
										style={{ width: "100%" }}
									/>
								</Link>
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
