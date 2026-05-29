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
			<img
				className="booster-pack-logo"
				src={set.images.logo}
				alt={`${set.name} logo`}
			/>
			<img
				className="booster-pack-symbol"
				src={set.images.symbol}
				alt={`${set.name} symbol`}
			/>
			<span className="booster-pack-label">
				<strong>{set.name}</strong>
				<span>RIP TO OPEN</span>
			</span>
		</button>
	);
}
