import type { StateCreator } from "zustand";

// User-facing inputs that should survive a page reload. Kept deliberately
// small — anything in here is mirrored to localStorage via the persist
// middleware in `./index.ts`.
export interface UISlice {
	selectedSetId: string | null;
	selectedPokedexNumber: number | null;
	setSelectedSetId: (id: string | null) => void;
	setSelectedPokedexNumber: (n: number | null) => void;
}

export const createUISlice: StateCreator<UISlice> = (set) => ({
	selectedSetId: null,
	selectedPokedexNumber: null,
	setSelectedSetId: (id) => set({ selectedSetId: id }),
	setSelectedPokedexNumber: (n) => set({ selectedPokedexNumber: n }),
});
