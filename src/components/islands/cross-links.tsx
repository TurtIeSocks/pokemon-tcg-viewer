import { Link, type LinkProps } from "@tanstack/react-router";

export interface CrossLink {
	label: string;
	link: LinkProps;
}

/**
 * Inline cross-navigation links for the card focus footer (e.g. "View all
 * Raichu", "Go to Skyridge"). Quiet mono `→` links that pick up the card's
 * type accent on hover — replaces the old floating overlay box.
 */
export function CardCrossLinks({ links }: { links: CrossLink[] }) {
	if (links.length === 0) return null;
	return (
		<div className="mt-3.5 flex flex-wrap gap-x-[18px] gap-y-2">
			{links.map((cl) => (
				<Link
					key={cl.label}
					{...cl.link}
					className="inline-flex items-center gap-1.5 font-mono text-xs tracking-[0.03em] text-[#9c988c] no-underline transition-colors hover:text-[color:var(--accent)] focus-visible:text-[color:var(--accent)] focus-visible:outline-none"
				>
					<span aria-hidden="true">→</span>
					{cl.label}
				</Link>
			))}
		</div>
	);
}
