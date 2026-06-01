import "./booster-pack.css";

export interface PackArt {
	name: string;
	logo: string;
	symbol: string;
}

interface BoosterPackProps {
	art: PackArt;
	ripped: boolean;
	onRip: () => void;
}

export function BoosterPack({ art, ripped, onRip }: BoosterPackProps) {
	return (
		<button
			type="button"
			className={`booster-pack${ripped ? " ripped" : ""}`}
			aria-label={`Open the ${art.name} booster pack`}
			onClick={onRip}
		>
			<span className="booster-pack-foil" aria-hidden="true" />
			<span className="booster-pack-crimp booster-pack-crimp--top" aria-hidden="true" />
			<span className="booster-pack-tear" aria-hidden="true">
				<span className="booster-pack-tear-label">Rip to open</span>
			</span>
			<span className="booster-pack-art">
				<img className="booster-pack-logo" src={art.logo} alt="" />
				<strong className="booster-pack-name">{art.name}</strong>
			</span>
			<img className="booster-pack-symbol" src={art.symbol} alt="" aria-hidden="true" />
			<span className="booster-pack-crimp booster-pack-crimp--bottom" aria-hidden="true" />
		</button>
	);
}
