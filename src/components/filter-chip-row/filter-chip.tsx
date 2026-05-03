import { useEffect, useRef, useState } from "react";
import { useFilterParam } from "../../hooks/use-url-selection";

interface FilterChipProps {
	/** User-facing label, e.g. "Type". */
	label: string;
	/** URL search-param key, e.g. "types". */
	paramName: string;
	/** Available values for this dimension. Empty → chip is disabled. */
	options: string[];
}

export function FilterChip({ label, paramName, options }: FilterChipProps) {
	const [values, setValues] = useFilterParam(paramName);
	const [isOpen, setIsOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		function onDocClick(e: MouseEvent) {
			if (
				containerRef.current &&
				!containerRef.current.contains(e.target as Node)
			) {
				setIsOpen(false);
			}
		}
		document.addEventListener("mousedown", onDocClick);
		return () => document.removeEventListener("mousedown", onDocClick);
	}, []);

	useEffect(() => {
		function onKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") setIsOpen(false);
		}
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, []);

	const isActive = values.length > 0;
	const isDisabled = options.length === 0;

	function toggleValue(option: string) {
		const next = values.includes(option)
			? values.filter((v) => v !== option)
			: [...values, option];
		setValues(next);
	}

	function clear() {
		setValues([]);
		setIsOpen(false);
	}

	const labelText = isActive
		? values.length === 1
			? `${label} · ${values[0]}`
			: `${label} · ${values[0]} +${values.length - 1}`
		: label;

	return (
		<div className="filter-chip-container" ref={containerRef}>
			<button
				type="button"
				className={`filter-chip${isActive ? " active" : ""}`}
				onClick={() => setIsOpen((o) => !o)}
				disabled={isDisabled}
				aria-expanded={isOpen}
				aria-haspopup="listbox"
				aria-label={label}
			>
				<span>{labelText}</span>
			</button>
			{isActive && (
				<button
					type="button"
					className="filter-chip-clear"
					onClick={clear}
					aria-label={`Clear ${label}`}
				>
					×
				</button>
			)}
			{isOpen && !isDisabled && (
				<div className="filter-chip-popover" role="listbox">
					{options.map((option) => (
						<label key={option} className="filter-chip-option">
							<input
								type="checkbox"
								checked={values.includes(option)}
								onChange={() => toggleValue(option)}
							/>
							<span>{option}</span>
						</label>
					))}
				</div>
			)}
		</div>
	);
}
