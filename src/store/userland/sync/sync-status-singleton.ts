// src/store/userland/sync/sync-status-singleton.ts
//
// Module-level singleton SyncStatusStore.  The engine (sync-engine.ts) and the
// UI (SyncIndicator, sync-toasts) all import from this file so there is exactly
// one status instance per tab — no prop-drilling, no React context needed.

import { createSyncStatusStore } from "./sync-status";

export const syncStatus = createSyncStatusStore();
