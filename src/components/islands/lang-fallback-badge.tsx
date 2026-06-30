/**
 * Small muted "EN" chip shown on a grid tile whose card has no localized data
 * for the active (non-English) catalog language -- it is rendering the English
 * fallback. Only the minority of fallback cards are badged, keeping the grid clean.
 */
export function LangFallbackBadge({ show }: { show: boolean }) {
	if (!show) return null;
	return (
		<span
			role="img"
			aria-label="Shown in English"
			className="pointer-events-none absolute right-1 top-1 rounded-[var(--r-pill)] border border-white/10 bg-black/45 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-[var(--ink-muted)] backdrop-blur-sm"
		>
			EN
		</span>
	);
}
