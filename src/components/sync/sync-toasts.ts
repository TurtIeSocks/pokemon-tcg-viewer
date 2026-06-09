// src/components/sync/sync-toasts.ts
//
// Subscribe to the sync status store's transition events and fire exactly one
// sonner toast per notable transition — never for routine syncing→synced.
//
// Transitions that trigger a toast:
//   "went-offline"        → warn: changes save locally, sync on reconnect.
//   "reconnected-synced"  → success: back online, changes synced.
//   "persistent-error"    → warn: couldn't sync, retrying.
//   "first-sync-complete" → info: Vault now syncs across devices.
//
// wireSyncToasts() is pure (no React). Mount SyncToastsWatcher in a ClientOnly
// block in the shell root — it wires the subscription once on mount.
// Injectable store + notify fn for tests.

import { useEffect } from "react";
import { toast as sonnerToast } from "sonner";
import { isCloudEnabled } from "@/lib/supabase/client";
import type {
	SyncStatusStore,
	SyncTransitionEvent,
} from "@/store/userland/sync/sync-status";
import { syncStatus } from "@/store/userland/sync/sync-status-singleton";

// ---------------------------------------------------------------------------
// Toast content per transition
// ---------------------------------------------------------------------------

interface ToastArgs {
	message: string;
	options?: Parameters<typeof sonnerToast>[1];
}

const TOAST_BY_EVENT: Partial<Record<SyncTransitionEvent, ToastArgs>> = {
	"went-offline": {
		message:
			"You're offline. Changes save locally and sync when you reconnect.",
		options: { id: "sync-went-offline", duration: 5000 },
	},
	"reconnected-synced": {
		message: "Back online — changes synced.",
		options: { id: "sync-reconnected", duration: 3000 },
	},
	"persistent-error": {
		message: "Couldn't sync — retrying.",
		options: { id: "sync-persistent-error", duration: 5000 },
	},
	"first-sync-complete": {
		message: "Your Vault now syncs across devices.",
		options: { id: "sync-first-complete", duration: 4000 },
	},
};

// ---------------------------------------------------------------------------
// Subscription wiring
// ---------------------------------------------------------------------------

type ToastFn = (
	message: string,
	options?: Parameters<typeof sonnerToast>[1],
) => void;

/**
 * Wire the sync-toast subscription to the given status store (defaults to the
 * module singleton). Returns an unsubscribe function. Injectable in tests via
 * `store` and `notify` parameters.
 */
export function wireSyncToasts(
	store: SyncStatusStore = syncStatus,
	notify: ToastFn = sonnerToast,
): () => void {
	return store.subscribe((event) => {
		const args = TOAST_BY_EVENT[event];
		if (!args) return;
		notify(args.message, args.options);
	});
}

// ---------------------------------------------------------------------------
// React watcher — mounts once in a ClientOnly block in the shell root
// ---------------------------------------------------------------------------

export interface SyncToastsWatcherProps {
	/** Injectable for tests; defaults to sonner's `toast`. */
	notify?: ToastFn;
}

/**
 * Null-rendering component that wires the sync-toast subscription on mount and
 * tears it down on unmount. Gate with `isCloudEnabled()` before rendering.
 */
export function SyncToastsWatcher({ notify }: SyncToastsWatcherProps = {}) {
	useEffect(() => {
		if (!isCloudEnabled()) return;
		return wireSyncToasts(syncStatus, notify ?? sonnerToast);
	}, [notify]);

	return null;
}
