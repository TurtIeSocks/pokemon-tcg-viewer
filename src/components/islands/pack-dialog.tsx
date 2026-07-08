import { Link, type LinkProps } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useIsOwned } from "../../store/userland/selectors";
import { rollPack } from "../../utils/roll-pack";
import { BoosterPack, type PackArt } from "../booster-pack/booster-pack";
import { HoloCard, type HoloCardData, holoCardProps } from "../holo-card";
import { CardMiniNav } from "../holo-card/card-mini-nav";

const RIP_DURATION_MS = 320;

/**
 * One pulled-pack cell. Subscribes to its own card's ownership (S3) so adding a
 * card via the mini-nav re-renders only that card, not the whole pack. Grayscale
 * (unowned) + the unified mini-nav match every other card grid in the app.
 */
function PackCard({
	card,
	cardHref,
}: {
	card: HoloCardData;
	cardHref: (card: HoloCardData) => LinkProps;
}) {
	const owned = useIsOwned(card.id);
	return (
		<Link {...cardHref(card)} className="block">
			<HoloCard
				{...holoCardProps(card)}
				owned={owned}
				miniNav={<CardMiniNav card={card} />}
				style={{ width: "100%" }}
			/>
		</Link>
	);
}

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
				<DialogHeader>
					<DialogTitle className="font-display">
						{`Open a ${art.name} pack`}
					</DialogTitle>
				</DialogHeader>
				{!pack ? (
					<div className="flex justify-center py-6">
						<BoosterPack art={art} ripped={ripped} onRip={onRip} />
					</div>
				) : (
					<>
						<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
							{pack.map((card) => (
								<PackCard key={card.id} card={card} cardHref={cardHref} />
							))}
						</div>
						<div className="flex justify-center pt-4">
							<Button onClick={onReroll} variant="soft">
								Open another pack
							</Button>
						</div>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
