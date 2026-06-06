import { TargetIcon } from "lucide-react";
import { PillToggle } from "./pill-toggle";

interface MatchModeToggleProps {
	/** True = exact (no fuzzy); false = fuzzy (default). */
	value: boolean;
	onChange: (exact: boolean) => void;
	disabled?: boolean;
}

/**
 * Fuzzy | Exact name-match toggle. Fuzzy (the default) tolerates typos and
 * near-misses; Exact restricts to exact/substring matches so a search — or a
 * binder rule built from it — won't pull in look-alike names.
 */
export function MatchModeToggle({
	value,
	onChange,
	disabled = false,
}: MatchModeToggleProps) {
	return (
		<PillToggle
			value={value}
			onChange={onChange}
			label="Exact"
			icon={<TargetIcon className="size-4" aria-hidden="true" />}
			title="Exact name match (off = fuzzy)"
			disabled={disabled}
		/>
	);
}
