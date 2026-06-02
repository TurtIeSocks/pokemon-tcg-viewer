import { getTypeColor } from "../../utils/card-colors";
import { ENERGY_GLYPH_FALLBACK, ENERGY_GLYPHS } from "./energy-glyphs";

interface EnergyIconProps {
	type: string;
	size?: number;
}

export function EnergyIcon({ type, size = 18 }: EnergyIconProps) {
	const fill = getTypeColor(type);
	const glyph = ENERGY_GLYPHS[type] ?? ENERGY_GLYPH_FALLBACK;

	return (
		<svg
			role="img"
			aria-label={type}
			width={size}
			height={size}
			viewBox="0 0 20 20"
			xmlns="http://www.w3.org/2000/svg"
		>
			<circle cx="10" cy="10" r="9" fill={fill} />
			<path d={glyph} fill="#fff" />
		</svg>
	);
}
