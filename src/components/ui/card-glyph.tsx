import type { SVGProps } from "react";

/**
 * Portrait trading-card glyph: an art window over two text lines. Marks the
 * CARD / catalog-language axis (what's printed on the cards), visually distinct
 * from the lucide `Globe` used for the interface-language axis so the two
 * language controls never read as the same setting.
 *
 * Drop-in for a lucide icon: pass `className` (e.g. "size-4 opacity-70") to
 * size and tint it. Inherits `currentColor` for the stroke.
 */
export function CardGlyph({ className, ...props }: SVGProps<SVGSVGElement>) {
	return (
		<svg
			width="24"
			height="24"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={2}
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
			aria-hidden="true"
			{...props}
		>
			<rect x="6" y="2.5" width="12" height="19" rx="2" />
			<rect x="8.5" y="5" width="7" height="6" rx="1" />
			<path d="M8.5 14.5h7" />
			<path d="M8.5 17.5h4.5" />
		</svg>
	);
}
