import type { ReactNode } from "react";

/** Props for {@link VaultSection}. */
interface VaultSectionProps {
	/** Section heading. */
	title: string;
	/** Optional right-aligned action (link or button) on the heading row. */
	action?: ReactNode;
	/** Section body. */
	children: ReactNode;
}

/**
 * A titled section within a Vault page. A quiet hairline rule plus generous top
 * spacing demarcate each section as its own "shelf" — giving multi-section pages
 * clear vertical rhythm without boxing every block in a heavy card.
 */
export function VaultSection({ title, action, children }: VaultSectionProps) {
	return (
		<section className="mt-8 space-y-4 border-t border-[var(--hairline)] pt-8">
			<div className="flex items-baseline justify-between gap-3">
				<h2 className="font-display text-[21px] font-medium text-[var(--ink)]">
					{title}
				</h2>
				{action}
			</div>
			{children}
		</section>
	);
}
