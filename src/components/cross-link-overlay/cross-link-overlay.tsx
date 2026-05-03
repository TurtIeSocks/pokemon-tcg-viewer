import { Link } from "react-router";
import "./cross-link-overlay.css";

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
		<div className="cross-link-overlay">
			{links.map((link) => (
				<Link key={link.to} to={link.to} className="cross-link-overlay-link">
					<span className="cross-link-overlay-arrow" aria-hidden="true">
						→
					</span>
					{link.label}
				</Link>
			))}
		</div>
	);
}
