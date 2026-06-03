interface MatchModeToggleProps {
	/** True = exact (no fuzzy); false = fuzzy (default). */
	value: boolean;
	onChange: (exact: boolean) => void;
	disabled?: boolean;
}

// Pill-button base: shared with ViewModeToggle for a consistent toggle language.
const btnBase =
	"px-[0.85rem] py-[0.35rem] bg-transparent border-none rounded-full text-[0.85rem] cursor-pointer transition-[background,color] duration-[120ms] ease-out text-white/65 hover:not-disabled:text-white/95 disabled:opacity-40 disabled:cursor-not-allowed";
const btnActive = "bg-[rgba(120,100,255,0.25)] text-white";

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
			className="inline-flex gap-1 p-1 bg-white/5 border border-white/10 rounded-full m-0 min-w-0"
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
