import { type KeyboardEvent, useLayoutEffect, useRef, useState } from "react";
import type { PokemonSet } from "../../api";

interface SeriesMenuItemProps {
	series: string;
	sets: PokemonSet[];
	isOpen: boolean;
	isActive: boolean;
	selectedSetId: string | null;
	onEnter: (series: string) => void;
	onLeave: () => void;
	onToggle: (series: string) => void;
	onOpen: (series: string) => void;
	onClose: () => void;
	onSelect: (setId: string) => void;
}

/**
 * One series in the menu: a trigger button plus its hover/click popover of
 * sets. Pointer enter/leave live on the wrapper so travelling from trigger to
 * popover never leaves the hoverable region. Keyboard users open with
 * ArrowDown/Enter, move with ArrowUp/Down, and dismiss with Escape.
 */
export function SeriesMenuItem({
	series,
	sets,
	isOpen,
	isActive,
	selectedSetId,
	onEnter,
	onLeave,
	onToggle,
	onOpen,
	onClose,
	onSelect,
}: SeriesMenuItemProps) {
	const triggerRef = useRef<HTMLButtonElement>(null);
	const itemsRef = useRef<(HTMLButtonElement | null)[]>([]);
	const popoverRef = useRef<HTMLDivElement>(null);
	const [alignRight, setAlignRight] = useState(false);

	// Flip the popover to right-anchored when left-anchored would spill past the
	// viewport edge — common for right-side series and on narrow screens. Runs
	// before paint from the left-anchored baseline, so there is no visible jump.
	useLayoutEffect(() => {
		if (!isOpen) {
			setAlignRight(false);
			return;
		}
		const el = popoverRef.current;
		if (!el) return;
		if (el.getBoundingClientRect().right > window.innerWidth - 8) {
			setAlignRight(true);
		}
	}, [isOpen]);

	function focusItem(index: number) {
		const count = sets.length;
		if (count === 0) return;
		const next = ((index % count) + count) % count;
		itemsRef.current[next]?.focus();
	}

	function onTriggerKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
		if (e.key === "ArrowDown") {
			e.preventDefault();
			onOpen(series);
			requestAnimationFrame(() => focusItem(0));
		} else if (e.key === "Escape") {
			onClose();
		}
	}

	function onItemKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
		if (e.key === "ArrowDown") {
			e.preventDefault();
			focusItem(index + 1);
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			focusItem(index - 1);
		} else if (e.key === "Home") {
			e.preventDefault();
			focusItem(0);
		} else if (e.key === "End") {
			e.preventDefault();
			focusItem(sets.length - 1);
		} else if (e.key === "Escape") {
			e.preventDefault();
			onClose();
			triggerRef.current?.focus();
		}
	}

	function handleSelect(setId: string) {
		onSelect(setId);
		onClose();
		triggerRef.current?.focus();
	}

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: hover open/close is a pointer-only enhancement; the keyboard path uses the trigger button (ArrowDown/Enter/Escape). The wrapper must own the handlers so the gap between trigger and popover stays one hover region.
		<div
			className="series-menu-item"
			onMouseEnter={() => onEnter(series)}
			onMouseLeave={onLeave}
		>
			<button
				ref={triggerRef}
				type="button"
				className={isActive ? "series-trigger active" : "series-trigger"}
				aria-haspopup="menu"
				aria-expanded={isOpen}
				onClick={() => onToggle(series)}
				onKeyDown={onTriggerKeyDown}
			>
				{series}
			</button>
			{isOpen && (
				<div
					ref={popoverRef}
					className={
						alignRight ? "series-popover align-right" : "series-popover"
					}
				>
					<div
						className="series-popover-card"
						role="menu"
						aria-label={`${series} sets`}
					>
						{sets.map((set, index) => {
							const selected = set.id === selectedSetId;
							return (
								<button
									key={set.id}
									ref={(el) => {
										itemsRef.current[index] = el;
									}}
									type="button"
									role="menuitem"
									className={selected ? "series-set active" : "series-set"}
									aria-current={selected ? "true" : undefined}
									onClick={() => handleSelect(set.id)}
									onKeyDown={(e) => onItemKeyDown(e, index)}
								>
									<img
										src={set.images.symbol}
										alt=""
										className="series-set-symbol"
									/>
									<span className="series-set-name">{set.name}</span>
								</button>
							);
						})}
					</div>
				</div>
			)}
		</div>
	);
}
