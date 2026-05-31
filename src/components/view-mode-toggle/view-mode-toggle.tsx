import type { ViewMode } from "../../hooks/use-url-selection";

interface ViewModeToggleProps {
	value: ViewMode;
	onChange: (next: ViewMode) => void;
	disabled: boolean;
}

// Pill-button base: shared across both mode buttons
const btnBase =
	"px-[0.85rem] py-[0.35rem] bg-transparent border-none rounded-full text-[0.85rem] cursor-pointer transition-[background,color] duration-[120ms] ease-out text-white/65 hover:not-disabled:text-white/95 disabled:opacity-40 disabled:cursor-not-allowed";
const btnActive = "bg-[rgba(120,100,255,0.25)] text-white";

export function ViewModeToggle({
	value,
	onChange,
	disabled,
}: ViewModeToggleProps) {
	// fieldset+aria-label is used (over div+role="group") to satisfy Biome's
	// useSemanticElements rule. Tailwind resets fieldset default border/padding/margin/min-inline-size.
	return (
		<fieldset
			className="inline-flex gap-1 p-1 bg-white/5 border border-white/10 rounded-full m-0 min-w-0"
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
