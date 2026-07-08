import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Persisted print-placeholder settings for the "Print missing" binder modal, so a
 * collector's colors/shape choices survive across sessions. Defaults match the
 * site's dark look: black fill, white text, violet border (`--primary`), ~3mm
 * corner radius (a real trading-card corner), 1.3x text scale for legible markers.
 */
export interface PrintPrefs {
	background: string;
	textColor: string;
	borderColor: string;
	/** Corner radius in millimetres. */
	radiusMm: number;
	/** Border thickness in millimetres (SVG stroke width). */
	borderMm: number;
	/** Multiplier applied to both text lines, preserving their ratio. */
	textScale: number;
	/** Placeholder width in millimetres. Drives how many fit per row. */
	cardWidthMm: number;
	/** Placeholder height in millimetres. Drives how many fit per column. */
	cardHeightMm: number;
}

export const DEFAULT_PRINT_PREFS: PrintPrefs = {
	background: "#000000",
	textColor: "#ffffff",
	// Site accent violet, kept verbatim from --primary in app.css so they stay matched.
	borderColor: "oklch(0.7 0.19 295)",
	radiusMm: 3,
	borderMm: 0.3,
	textScale: 1.3,
	// Standard trading-card dimensions (mm); adjustable so the grid re-fits.
	cardWidthMm: 63,
	cardHeightMm: 88,
};

interface UiPrefsStore {
	/**
	 * Filter-panel open state. `null` = follow the viewport default (expanded on
	 * desktop, collapsed on mobile); once the user toggles, their explicit choice
	 * persists across reloads on every viewport.
	 */
	filtersOpen: boolean | null;
	setFiltersOpen: (open: boolean) => void;
	/**
	 * Whether cards run the pointer-tracking 3D tilt + foil (useHoloEffect).
	 * Default `true`. When `false` the tilt is disabled everywhere (cards fall
	 * back to a plain hover lift). `prefers-reduced-motion` always wins and force
	 * disables the tilt regardless of this pref (handled in useHoloEffect).
	 */
	cardMotion: boolean;
	setCardMotion: (on: boolean) => void;
	/** Print-placeholder settings; see {@link PrintPrefs}. */
	printPrefs: PrintPrefs;
	/** Merge a partial update into the saved print settings. */
	setPrintPrefs: (patch: Partial<PrintPrefs>) => void;
	/** Restore every print setting to {@link DEFAULT_PRINT_PREFS}. */
	resetPrintPrefs: () => void;
}

// localStorage on the client (synchronous → rehydrates before first paint, no
// flash); a no-op on the server so importing the store during SSR can't crash.
const storage = createJSONStorage<
	Pick<UiPrefsStore, "filtersOpen" | "cardMotion" | "printPrefs">
>(() =>
	typeof window === "undefined"
		? { getItem: () => null, setItem: () => {}, removeItem: () => {} }
		: localStorage,
);

export const useUiPrefs = create<UiPrefsStore>()(
	persist(
		(set) => ({
			filtersOpen: null,
			setFiltersOpen: (filtersOpen) => set({ filtersOpen }),
			cardMotion: true,
			setCardMotion: (cardMotion) => set({ cardMotion }),
			printPrefs: DEFAULT_PRINT_PREFS,
			setPrintPrefs: (patch) =>
				set((s) => ({ printPrefs: { ...s.printPrefs, ...patch } })),
			resetPrintPrefs: () => set({ printPrefs: DEFAULT_PRINT_PREFS }),
		}),
		{
			name: "cardstack-ui-prefs",
			storage,
			partialize: (s) => ({
				filtersOpen: s.filtersOpen,
				cardMotion: s.cardMotion,
				printPrefs: s.printPrefs,
			}),
		},
	),
);
