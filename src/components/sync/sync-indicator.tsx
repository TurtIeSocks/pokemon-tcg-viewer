// src/components/sync/sync-indicator.tsx
//
// Subtle sidebar-footer status indicator for the background sync engine.
// Shows only when cloud is enabled AND the user has an active session.
// Subscribes to the module-level syncStatus singleton.

"use client";

import { useEffect, useState } from "react";
import { useAuthSession } from "@/components/auth/use-auth-session";
import { isCloudEnabled } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { SyncStatus } from "@/store/userland/sync/sync-status";
import { syncStatus } from "@/store/userland/sync/sync-status-singleton";

// ---------------------------------------------------------------------------
// Status → display config
// ---------------------------------------------------------------------------

interface StatusConfig {
	label: string;
	dotClass: string;
}

const STATUS_CONFIG: Record<SyncStatus, StatusConfig> = {
	synced: {
		label: "Synced",
		dotClass: "bg-[var(--success)]",
	},
	syncing: {
		label: "Syncing…",
		dotClass: "bg-[var(--primary)] animate-pulse",
	},
	offline: {
		label: "Offline",
		dotClass: "bg-[var(--ink-muted)]",
	},
	error: {
		label: "Sync error",
		dotClass: "bg-amber-400",
	},
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Props for {@link SyncIndicator}. Allows injecting a custom status source in tests. */
export interface SyncIndicatorProps {
	/** Override for the current sync status (test seam). Defaults to the singleton. */
	statusOverride?: SyncStatus;
}

/**
 * Small dot + label that tracks the sync engine status. Renders nothing when
 * cloud is disabled or no session is active (signed-out). Mount once in the
 * sidebar footer near the auth controls.
 */
export function SyncIndicator({ statusOverride }: SyncIndicatorProps) {
	const [status, setStatus] = useState<SyncStatus>(
		statusOverride ?? syncStatus.status,
	);
	const { session, ready } = useAuthSession();

	// Subscribe to the real singleton unless a test override is provided.
	useEffect(() => {
		if (statusOverride !== undefined) {
			setStatus(statusOverride);
			return;
		}
		// Sync to current value in case it changed between render and this effect.
		setStatus(syncStatus.status);
		// Subscribe to future transitions.  The status store emits on transitions,
		// but we also poll the getter so status changes that DON'T emit a transition
		// event (e.g. syncing → synced without an event) still update the dot.
		const unsub = syncStatus.subscribe(() => {
			setStatus(syncStatus.status);
		});
		return unsub;
	}, [statusOverride]);

	if (!isCloudEnabled()) return null;
	if (!ready || !session) return null;

	const { label, dotClass } = STATUS_CONFIG[status];

	return (
		<div
			role="status"
			aria-label={`Sync status: ${label}`}
			className="flex items-center gap-1.5 px-1 pb-0.5 pt-0"
		>
			<span
				className={cn(
					"size-1.5 shrink-0 rounded-full motion-reduce:animate-none",
					dotClass,
				)}
			/>
			<span className="truncate font-mono text-[10px] text-(--faint) tabular-nums">
				{label}
			</span>
		</div>
	);
}
