import type { ViewMode } from "../../lib/card-query";

interface ViewModeToggleProps {
	value: ViewMode;
	onChange: (next: ViewMode) => void;
	disabled: boolean;
}

// Pill-button base: shared across both mode buttons
const btnBase =
	"px-3 py-1.5 bg-transparent border-none rounded-[var(--r-pill)] text-sm cursor-pointer transition-[background,color] duration-[120ms] ease-out text-[var(--ink-muted)] hover:text-[var(--ink)] disabled:opacity-40 disabled:cursor-not-allowed";
const btnActive = "bg-[var(--primary)] text-[var(--primary-ink)] font-semibold";

export function ViewModeToggle({
	value,
	onChange,
	disabled,
}: ViewModeToggleProps) {
	// fieldset+aria-label is used (over div+role="group") to satisfy Biome's
	// useSemanticElements rule. Tailwind resets fieldset default border/padding/margin/min-inline-size.
	return (
		<fieldset
			className="inline-flex rounded-[var(--r-pill)] bg-[var(--glass)] border border-[var(--border)] p-0.5 m-0 min-w-0"
			aria-label="View mode"
		>
			<button
				type="button"
				className={`${btnBase}${value === "grid" ? ` ${btnActive}` : ""}`}
				onClick={() => onChange("grid")}
				disabled={disabled}
				aria-pressed={value === "grid"}
			>
				Grid
			</button>
			<button
				type="button"
				className={`${btnBase}${value === "timeline" ? ` ${btnActive}` : ""}`}
				onClick={() => onChange("timeline")}
				disabled={disabled}
				aria-pressed={value === "timeline"}
			>
				Timeline
			</button>
		</fieldset>
	);
}
