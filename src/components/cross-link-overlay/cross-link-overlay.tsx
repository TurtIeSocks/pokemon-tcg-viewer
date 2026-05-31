import { Link } from "react-router";

export interface CrossLink {
	label: string;
	to: string;
}

interface CrossLinkOverlayProps {
	links: CrossLink[];
}

/**
 * Hover-overlay payload rendered inside <HoloCard hoverOverlay={…} />.
 * Each link navigates somewhere that re-anchors the page (set or
 * Pokémon view). Returns null when there are no links so callers can
 * safely pass an empty array for cards without cross-link targets
 * (Trainers, Energies).
 */
export function CrossLinkOverlay({ links }: CrossLinkOverlayProps) {
	if (links.length === 0) return null;
	return (
		<div className="flex flex-col gap-1 px-3 py-2 bg-[rgba(0,0,0,0.6)] backdrop-blur-[8px] rounded-lg text-white text-[0.85rem] leading-[1.2] max-w-[16rem] shadow-[0_4px_12px_rgba(0,0,0,0.3)]">
			{links.map((link) => (
				<Link
					key={link.to}
					to={link.to}
					className="inline-flex items-center gap-[0.4rem] text-white no-underline px-[0.4rem] py-1 rounded transition-[background] duration-[120ms] ease-out hover:bg-[rgba(255,255,255,0.12)] focus-visible:bg-[rgba(255,255,255,0.12)] focus-visible:outline-none"
				>
					<span className="text-[0.9em] opacity-80" aria-hidden="true">
						→
					</span>
					{link.label}
				</Link>
			))}
		</div>
	);
}
