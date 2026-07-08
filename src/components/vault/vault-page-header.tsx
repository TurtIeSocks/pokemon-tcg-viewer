import type { ReactNode } from "react";

/** Props for {@link VaultPageHeader}. */
interface VaultPageHeaderProps {
	/** Page title rendered as the h1. */
	title: string;
	/** One-line descriptor shown under the title. */
	subtitle?: string;
	/** Optional right-aligned actions (buttons, filters). */
	actions?: ReactNode;
}

/**
 * Shared header for every Vault sub-page. Renders one uniform structure — a
 * display-font title, an optional subtitle, and an optional right-aligned
 * actions slot — so the whole Vault area reads as one cohesive section instead
 * of four hand-rolled headers.
 */
export function VaultPageHeader({
	title,
	subtitle,
	actions,
}: VaultPageHeaderProps) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-3">
			<div className="space-y-1.5">
				<h1 className="font-display text-2xl font-semibold tracking-tight text-(--ink)">
					{title}
				</h1>
				{subtitle ? (
					<p className="text-[15px] text-(--ink-muted)">{subtitle}</p>
				) : null}
			</div>
			{actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
		</div>
	);
}
