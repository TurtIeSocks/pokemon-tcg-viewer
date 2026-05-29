import type { ViewMode } from "../../hooks/use-url-selection";
import "./view-mode-toggle.css";

interface ViewModeToggleProps {
	value: ViewMode;
	onChange: (next: ViewMode) => void;
	disabled: boolean;
}

export function ViewModeToggle({
	value,
	onChange,
	disabled,
}: ViewModeToggleProps) {
	// fieldset+aria-label is used (over div+role="group") to satisfy Biome's
	// useSemanticElements rule. The CSS below resets fieldset's default border,
	// padding, margin, and min-inline-size to make it look like a pill group.
	return (
		<fieldset className="view-mode-toggle" aria-label="View mode">
			<button
				type="button"
				className={`view-mode-toggle-button${value === "grid" ? " active" : ""}`}
				onClick={() => onChange("grid")}
				disabled={disabled}
				aria-pressed={value === "grid"}
			>
				Grid
			</button>
			<button
				type="button"
				className={`view-mode-toggle-button${value === "timeline" ? " active" : ""}`}
				onClick={() => onChange("timeline")}
				disabled={disabled}
				aria-pressed={value === "timeline"}
			>
				Timeline
			</button>
		</fieldset>
	);
}
