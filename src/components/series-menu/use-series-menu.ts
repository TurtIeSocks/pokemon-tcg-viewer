import {
	type RefObject,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

interface UseSeriesMenuOptions {
	/** Delay before a hover opens a closed menu (ms). */
	openDelay?: number;
	/** Grace period before a pointer-leave closes the menu (ms). */
	closeDelay?: number;
}

export interface SeriesMenuState {
	/** The series whose popover is currently open, or null. */
	openSeries: string | null;
	/** Ref for the menu root — used for outside-click detection. */
	rootRef: RefObject<HTMLElement | null>;
	/** Pointer entered a series region — open with hover-intent. */
	handleEnter: (series: string) => void;
	/** Pointer left a series region — close after the grace period. */
	handleLeave: () => void;
	/** Trigger clicked/tapped — toggle immediately. */
	toggle: (series: string) => void;
	/** Open immediately (keyboard / programmatic). */
	openNow: (series: string) => void;
	/** Close immediately (Escape, selection, outside click). */
	closeNow: () => void;
}

/**
 * Hover-intent state machine for the series menu. A single `openSeries` value
 * guarantees only one popover is open at a time. Hovering a trigger opens it
 * after `openDelay`; leaving closes it after `closeDelay` (a grace period so the
 * pointer can travel from trigger to popover). While a menu is already open,
 * hovering a sibling switches instantly — standard menubar behavior.
 */
export function useSeriesMenu({
	openDelay = 100,
	closeDelay = 180,
}: UseSeriesMenuOptions = {}): SeriesMenuState {
	const [openSeries, setOpenSeries] = useState<string | null>(null);
	const rootRef = useRef<HTMLElement | null>(null);
	const openTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
		undefined,
	);
	const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
		undefined,
	);
	// Mirror open state so document listeners read the latest without resubscribing.
	const openRef = useRef<string | null>(null);
	openRef.current = openSeries;

	const clearTimers = useCallback(() => {
		clearTimeout(openTimer.current);
		clearTimeout(closeTimer.current);
	}, []);

	const openNow = useCallback(
		(series: string) => {
			clearTimers();
			setOpenSeries(series);
		},
		[clearTimers],
	);

	const closeNow = useCallback(() => {
		clearTimers();
		setOpenSeries(null);
	}, [clearTimers]);

	const handleEnter = useCallback(
		(series: string) => {
			clearTimeout(closeTimer.current);
			clearTimeout(openTimer.current);
			// A menu is already open → switch instantly (menubar behavior).
			if (openRef.current !== null) {
				setOpenSeries(series);
				return;
			}
			openTimer.current = setTimeout(() => setOpenSeries(series), openDelay);
		},
		[openDelay],
	);

	const handleLeave = useCallback(() => {
		clearTimeout(openTimer.current);
		closeTimer.current = setTimeout(() => setOpenSeries(null), closeDelay);
	}, [closeDelay]);

	const toggle = useCallback(
		(series: string) => {
			clearTimers();
			setOpenSeries((cur) => (cur === series ? null : series));
		},
		[clearTimers],
	);

	// Close on click outside the menu root.
	useEffect(() => {
		function onDocMouseDown(e: MouseEvent) {
			if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
				closeNow();
			}
		}
		document.addEventListener("mousedown", onDocMouseDown);
		return () => document.removeEventListener("mousedown", onDocMouseDown);
	}, [closeNow]);

	// Close on Escape from anywhere while open.
	useEffect(() => {
		function onKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape" && openRef.current !== null) closeNow();
		}
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [closeNow]);

	// Clear any pending timers on unmount.
	useEffect(() => clearTimers, [clearTimers]);

	return {
		openSeries,
		rootRef,
		handleEnter,
		handleLeave,
		toggle,
		openNow,
		closeNow,
	};
}
