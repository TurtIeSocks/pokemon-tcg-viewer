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
}

// localStorage on the client (synchronous → rehydrates before first paint, no
// flash); a no-op on the server so importing the store during SSR can't crash.
const storage = createJSONStorage<Pick<UiPrefsStore, "filtersOpen">>(() =>
	typeof window === "undefined"
		? { getItem: () => null, setItem: () => {}, removeItem: () => {} }
		: localStorage,
);

export const useUiPrefs = create<UiPrefsStore>()(
	persist(
		(set) => ({
			filtersOpen: null,
			setFiltersOpen: (filtersOpen) => set({ filtersOpen }),
		}),
		{
			name: "cardstack-ui-prefs",
			storage,
			partialize: (s) => ({ filtersOpen: s.filtersOpen }),
		},
	),
);
