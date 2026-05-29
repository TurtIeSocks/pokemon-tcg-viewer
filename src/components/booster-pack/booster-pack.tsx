import type { PokemonSet } from "../../api";
import "./booster-pack.css";

interface BoosterPackProps {
	set: PokemonSet;
	ripped: boolean;
	onRip: () => void;
}

export function BoosterPack({ set, ripped, onRip }: BoosterPackProps) {
	return (
		<button
			type="button"
			className={`booster-pack${ripped ? " ripped" : ""}`}
			aria-label={`Open the ${set.name} booster pack`}
			onClick={onRip}
		>
			{/* Holographic mylar sheen — animated rainbow + glitter. Decorative. */}
			<span className="booster-pack-foil" aria-hidden="true" />
			{/* Crimped/sealed top + bottom edges of the foil wrapper. Decorative. */}
			<span
				className="booster-pack-crimp booster-pack-crimp--top"
				aria-hidden="true"
			/>
			{/* Perforated tear strip with the rip-here label. */}
			<span className="booster-pack-tear" aria-hidden="true">
				<span className="booster-pack-tear-label">Rip to open</span>
			</span>
			{/* Printed wrapper art: set logo + name. */}
			<span className="booster-pack-art">
				<img className="booster-pack-logo" src={set.images.logo} alt="" />
				<strong className="booster-pack-name">{set.name}</strong>
			</span>
			<img
				className="booster-pack-symbol"
				src={set.images.symbol}
				alt=""
				aria-hidden="true"
			/>
			<span
				className="booster-pack-crimp booster-pack-crimp--bottom"
				aria-hidden="true"
			/>
		</button>
	);
}
