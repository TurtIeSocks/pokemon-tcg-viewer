interface MatchModeToggleProps {
	/** True = exact (no fuzzy); false = fuzzy (default). */
	value: boolean;
	onChange: (exact: boolean) => void;
	disabled?: boolean;
}

// Pill-button base: shared with ViewModeToggle for a consistent toggle language.
const btnBase =
	"px-3 py-1.5 bg-transparent border-none rounded-[var(--r-pill)] text-sm cursor-pointer transition-[background,color] duration-[120ms] ease-out text-[var(--ink-muted)] hover:text-[var(--ink)] disabled:opacity-40 disabled:cursor-not-allowed";
const btnActive = "bg-[var(--primary)] text-[var(--primary-ink)] font-semibold";

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
	// fieldset+aria-label (over div+role="group") to satisfy Biome's useSemanticElements.
	return (
		<fieldset
			className="inline-flex rounded-[var(--r-pill)] bg-[var(--glass)] border border-[var(--border)] p-0.5 m-0 min-w-0"
			aria-label="Match mode"
		>
			<button
				type="button"
				className={`${btnBase}${!value ? ` ${btnActive}` : ""}`}
				onClick={() => onChange(false)}
				disabled={disabled}
				aria-pressed={!value}
			>
				Fuzzy
			</button>
			<button
				type="button"
				className={`${btnBase}${value ? ` ${btnActive}` : ""}`}
				onClick={() => onChange(true)}
				disabled={disabled}
				aria-pressed={value}
			>
				Exact
			</button>
		</fieldset>
	);
}
