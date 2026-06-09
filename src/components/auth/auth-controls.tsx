"use client";

import { LogIn } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { isCloudEnabled } from "@/lib/supabase/client";
import { SignIn } from "./sign-in";
import { SignOutButton } from "./sign-out-button";
import { useAuthSession } from "./use-auth-session";

/**
 * Compact auth surface for the sidebar footer. When cloud is enabled it shows a
 * "Sign in" dialog trigger while signed out, and the signed-in email + a
 * sign-out control once authenticated. Renders nothing when cloud is disabled,
 * so the local-first app is unchanged.
 */
export function AuthControls() {
	const [open, setOpen] = useState(false);
	const { email, session, ready } = useAuthSession();

	if (!isCloudEnabled()) return null;
	// Avoid a sign-in/out flicker before the initial session check resolves.
	if (!ready) return null;

	if (session) {
		return (
			<div className="flex items-center justify-between gap-2 px-1 pb-1">
				<span
					className="min-w-0 flex-1 truncate text-xs text-[var(--ink-muted)]"
					title={email ?? undefined}
				>
					{email ?? "Signed in"}
				</span>
				<SignOutButton />
			</div>
		);
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="soft" size="sm" className="w-full">
					<LogIn />
					Sign in to sync
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="font-display">Sign in</DialogTitle>
					<DialogDescription>
						Sync your Vault across devices. We'll email you a magic link — no
						password needed.
					</DialogDescription>
				</DialogHeader>
				<SignIn />
			</DialogContent>
		</Dialog>
	);
}
