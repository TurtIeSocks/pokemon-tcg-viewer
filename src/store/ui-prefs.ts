import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Persisted print-placeholder settings for the "Print missing" binder modal, so a
 * collector's colors/shape choices survive across sessions. Print-friendly
 * defaults: white fill, near-black text + border (least ink, high contrast),
 * ~3mm corner radius (a real trading-card corner), 1x text scale.
 */
export interface PrintPrefs {
	background: string;
	textColor: string;
	borderColor: string;
	/** Corner radius in millimetres. */
	radiusMm: number;
	/** Multiplier applied to both text lines, preserving their ratio. */
	textScale: number;
}

export const DEFAULT_PRINT_PREFS: PrintPrefs = {
	background: "#ffffff",
	textColor: "#111111",
	borderColor: "#111111",
	radiusMm: 3,
	textScale: 1,
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
