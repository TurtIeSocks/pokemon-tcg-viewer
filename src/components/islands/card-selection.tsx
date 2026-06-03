import {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";

/** Public shape of the card selection state. */
export interface CardSelection {
	active: boolean;
	selected: Set<string>;
	toggleActive(): void;
	toggle(id: string): void;
	clear(): void;
}

const noOp = () => {};

/** Default value: inactive, no selection, no-op actions. Used when no provider is present. */
const defaultCardSelection: CardSelection = {
	active: false,
	selected: new Set(),
	toggleActive: noOp,
	toggle: noOp,
	clear: noOp,
};

const CardSelectionContext = createContext<CardSelection>(defaultCardSelection);

/** Provides card selection state to the subtree. */
export function CardSelectionProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const [active, setActive] = useState(false);
	const [selected, setSelected] = useState<Set<string>>(new Set());

	const toggleActive = useCallback(() => {
		setActive((prev) => {
			if (prev) {
				// Turning off: clear the selection.
				setSelected(new Set());
			}
			return !prev;
		});
	}, []);

	const toggle = useCallback((id: string) => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	}, []);

	const clear = useCallback(() => {
		setSelected(new Set());
	}, []);

	const value = useMemo<CardSelection>(
		() => ({ active, selected, toggleActive, toggle, clear }),
		[active, selected, toggleActive, toggle, clear],
	);

	return (
		<CardSelectionContext.Provider value={value}>
			{children}
		</CardSelectionContext.Provider>
	);
}

/**
 * Reads the card selection context.
 * When no {@link CardSelectionProvider} is present, returns the default
 * (inactive, empty, no-op) so pages without selection support work as-is.
 */
export function useCardSelection(): CardSelection {
	return useContext(CardSelectionContext);
}
