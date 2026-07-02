import { ClientOnly } from "@tanstack/react-router";
import { cardThumbSrc, HoloCard, type HoloCardProps } from "../holo-card";

/**
 * Server renders a plain <img> (crawlable, no hydration risk); the client
 * upgrades to the interactive pointer-reactive HoloCard after mount. The
 * fallback markup intentionally mirrors the card image so the swap is seamless.
 */
export function HoloCardIsland(props: HoloCardProps) {
	const { imageUrl, imageUrlSmall, name } = props;
	return (
		<ClientOnly
			fallback={
				<img
					src={cardThumbSrc({ imageUrl, imageUrlSmall })}
					alt={name}
					loading="lazy"
					className="w-full rounded"
				/>
			}
		>
			<HoloCard {...props} />
		</ClientOnly>
	);
}
