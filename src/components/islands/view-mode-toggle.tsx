import { GanttChartIcon } from "lucide-react";
import type { ViewMode } from "../../lib/card-query";
import { PillToggle } from "./pill-toggle";

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
	return (
		<PillToggle
			value={value === "timeline"}
			onChange={(on) => onChange(on ? "timeline" : "grid")}
			label="Timeline"
			icon={<GanttChartIcon className="size-4" aria-hidden="true" />}
			title="Toggle timeline view (off = grid)"
			disabled={disabled}
		/>
	);
}
