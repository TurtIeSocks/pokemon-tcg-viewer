import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

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
}

// localStorage on the client (synchronous → rehydrates before first paint, no
// flash); a no-op on the server so importing the store during SSR can't crash.
const storage = createJSONStorage<
	Pick<UiPrefsStore, "filtersOpen" | "cardMotion">
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
		}),
		{
			name: "cardstack-ui-prefs",
			storage,
			partialize: (s) => ({
				filtersOpen: s.filtersOpen,
				cardMotion: s.cardMotion,
			}),
		},
	),
);
