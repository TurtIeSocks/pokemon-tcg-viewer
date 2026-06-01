import { del, get, set } from "idb-keyval";
import type { PersistStorage, StorageValue } from "zustand/middleware";

export const IDB_KEY = "pokemon-tcg-viewer-state";
export const LEGACY_LOCALSTORAGE_KEY = "pokemon-tcg-viewer";

/**
 * Zustand PersistStorage adapter backed by idb-keyval. The first read on
 * v5 also migrates any legacy localStorage blob into IDB, then deletes
 * the legacy key so it doesn't ghost-rehydrate later. JSON-encodes the
 * value to match the original localStorage format.
 */
export function createIdbStorage<T>(): PersistStorage<T> {
	// On the server there is no IndexedDB/localStorage. Return a no-op storage so
	// importing the store during SSR can't crash; the client adapter rehydrates
	// on mount.
	if (typeof window === "undefined") {
		return {
			getItem: async () => null,
			setItem: async () => {},
			removeItem: async () => {},
		};
	}
	return {
		getItem: async (): Promise<StorageValue<T> | null> => {
			const value = await get<string | undefined>(IDB_KEY);
			if (value !== undefined) {
				try {
					return JSON.parse(value) as StorageValue<T>;
				} catch (e) {
					console.error("Failed to parse IDB payload; resetting", e);
					await del(IDB_KEY);
					return null;
				}
			}
			// Fallback: first load on v5. Migrate from localStorage if present.
			if (typeof localStorage === "undefined") return null;
			const legacy = localStorage.getItem(LEGACY_LOCALSTORAGE_KEY);
			if (legacy === null) return null;
			try {
				const parsed = JSON.parse(legacy) as StorageValue<T>;
				await set(IDB_KEY, legacy);
				localStorage.removeItem(LEGACY_LOCALSTORAGE_KEY);
				return parsed;
			} catch (e) {
				console.error("Failed to migrate legacy localStorage; ignoring", e);
				localStorage.removeItem(LEGACY_LOCALSTORAGE_KEY);
				return null;
			}
		},
		setItem: async (_name, value) => {
			await set(IDB_KEY, JSON.stringify(value));
		},
		removeItem: async () => {
			await del(IDB_KEY);
		},
	};
}
