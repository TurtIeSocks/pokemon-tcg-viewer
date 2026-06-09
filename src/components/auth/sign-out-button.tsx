"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { isCloudEnabled } from "@/lib/supabase/client";
import { signOut } from "./auth-actions";

/** Props for {@link SignOutButton}. */
interface SignOutButtonProps {
	/** Called after a successful sign-out (e.g. to close a menu). */
	onSignedOut?: () => void;
	className?: string;
}

/**
 * Sign-out control. Renders nothing when cloud is disabled. The auth-state
 * listener (wired separately) resets and re-hydrates the Vault from the local
 * repo on the resulting `SIGNED_OUT` event.
 */
export function SignOutButton({ onSignedOut, className }: SignOutButtonProps) {
	const [busy, setBusy] = useState(false);
	if (!isCloudEnabled()) return null;

	return (
		<Button
			type="button"
			variant="ghost"
			size="sm"
			className={className}
			disabled={busy}
			onClick={async () => {
				setBusy(true);
				try {
					await signOut();
					onSignedOut?.();
				} finally {
					setBusy(false);
				}
			}}
		>
			<LogOut />
			{busy ? "Signing out…" : "Sign out"}
		</Button>
	);
}
