import { useCallback, useEffect, useRef, useState } from "react";
import "./card-search.css";

interface CardSearchProps {
	value: string;
	onChange: (query: string) => void;
	/** Debounce window before an edit is committed to onChange. */
	debounceMs?: number;
}

export function CardSearch({
	value,
	onChange,
	debounceMs = 300,
}: CardSearchProps) {
	const [text, setText] = useState(value);

	// Keep the latest onChange without making commit() change identity.
	const onChangeRef = useRef(onChange);
	useEffect(() => {
		onChangeRef.current = onChange;
	}, [onChange]);

	// The last value we've pushed up / received down. Used to (a) dedupe
	// no-op commits and (b) detect genuinely external value changes so we
	// can mirror them back into the box without clobbering live typing.
	const lastCommittedRef = useRef(value);

	useEffect(() => {
		if (value !== lastCommittedRef.current) {
			setText(value);
			lastCommittedRef.current = value;
		}
	}, [value]);

	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const clearTimer = () => {
		if (timerRef.current) {
			clearTimeout(timerRef.current);
			timerRef.current = null;
		}
	};
	// Clear any pending debounce on unmount. References only the stable ref,
	// so it needs no dependency on the per-render clearTimer helper.
	useEffect(
		() => () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		},
		[],
	);

	const commit = useCallback((next: string) => {
		const trimmed = next.trim();
		if (trimmed === lastCommittedRef.current) return;
		lastCommittedRef.current = trimmed;
		onChangeRef.current(trimmed);
	}, []);

	function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
		const next = e.target.value;
		setText(next);
		clearTimer();
		timerRef.current = setTimeout(() => commit(next), debounceMs);
	}

	function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
		if (e.key === "Enter") {
			e.preventDefault();
			clearTimer();
			commit(text);
		} else if (e.key === "Escape") {
			clear();
		}
	}

	function clear() {
		clearTimer();
		setText("");
		commit("");
	}

	const showClear = text.length > 0;

	return (
		<div className="card-search">
			<div className="card-search-input-wrap">
				<input
					type="search"
					className="card-search-input"
					placeholder="Search any card by name (e.g. Pikachu, Erika, Boss's Orders)"
					value={text}
					onChange={handleInput}
					onKeyDown={handleKeyDown}
					autoComplete="off"
					aria-label="Search cards by name"
				/>
				{showClear && (
					<button
						type="button"
						className="card-search-clear"
						onClick={clear}
						aria-label="Clear search"
					>
						×
					</button>
				)}
			</div>
		</div>
	);
}
