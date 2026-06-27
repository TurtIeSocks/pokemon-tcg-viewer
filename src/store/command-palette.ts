import { create } from "zustand";

interface CommandPaletteStore {
	open: boolean;
	setOpen: (open: boolean) => void;
	toggle: () => void;
}

/**
 * Ephemeral open-state for the ⌘K command palette. The header trigger and the
 * global keyboard shortcut live far from the dialog in the tree, so a tiny
 * store decouples them — no context provider, no prop-drilling. Not persisted.
 */
export const useCommandPalette = create<CommandPaletteStore>((set) => ({
	open: false,
	setOpen: (open) => set({ open }),
	toggle: () => set((s) => ({ open: !s.open })),
}));
