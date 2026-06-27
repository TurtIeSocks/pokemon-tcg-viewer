"use client";

import { Link } from "@tanstack/react-router";
import {
	ChevronsUpDown,
	CreditCard,
	LogIn,
	LogOut,
	UserRound,
} from "lucide-react";
import { useState } from "react";
import { signOut } from "@/components/auth/auth-actions";
import { SignIn } from "@/components/auth/sign-in";
import { useAuthSession } from "@/components/auth/use-auth-session";
import { DEFAULT_AVATAR_PRESET_ID } from "@/components/profile/avatar-presets";
import { CollectorAvatar } from "@/components/profile/collector-avatar";
import { useAccountStatusDisplay } from "@/components/sync/sync-status-display";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@/components/ui/sidebar";
import { isCloudEnabled } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { checkStale } from "@/store/corpus/detail-runtime";
import { useUserland } from "@/store/userland/userland-store";
import { OfflineToggle } from "./offline-toggle";

/**
 * Sidebar footer account control. Collapses the former three-row footer (profile
 * link + auth controls + sync dot) into a single row that opens a dropdown:
 *
 *   • info group   — avatar + display name, signed-in email, live sync status
 *   • action group — edit profile, and sign out / sign in to sync (cloud only)
 *
 * The trigger's avatar carries a small sync-status badge when signed in. The
 * sign-in dialog is controlled separately so dismissing the menu can't unmount
 * it mid-open.
 */
export function SidebarUserMenu() {
	const profile = useUserland((s) => s.profile);
	const { isMobile, setOpenMobile } = useSidebar();
	const { session, email, ready } = useAuthSession();
	const [signInOpen, setSignInOpen] = useState(false);

	const cloud = isCloudEnabled();
	const displayName = profile?.displayName || "Collector";
	const preset = profile?.avatarPreset ?? DEFAULT_AVATAR_PRESET_ID;
	// `ready` gates auth-derived UI so we don't flash sign-in/out before the
	// initial session check resolves.
	const signedIn = cloud && ready && Boolean(session);
	const canSignIn = cloud && ready && !session;

	return (
		<>
			<SidebarMenu>
				<SidebarMenuItem>
					<DropdownMenu
						onOpenChange={(open) => {
							if (open) void checkStale();
						}}
					>
						<DropdownMenuTrigger asChild>
							<SidebarMenuButton
								size="lg"
								className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
							>
								<SyncAvatar
									displayName={displayName}
									preset={preset}
									signedIn={signedIn}
								/>
								<div className="grid flex-1 text-left text-sm leading-tight">
									<span className="truncate font-medium">{displayName}</span>
									{/* Status stays under the name so it's always visible. */}
									<AccountStatusLine signedIn={signedIn} />
								</div>
								<ChevronsUpDown className="ml-auto size-4 text-(--ink-muted)" />
							</SidebarMenuButton>
						</DropdownMenuTrigger>

						<DropdownMenuContent
							className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
							side={isMobile ? "bottom" : "right"}
							align="end"
							sideOffset={8}
						>
							{/* Info group: identity + live sync status. */}
							<DropdownMenuLabel className="p-0 font-normal">
								<div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
									<SyncAvatar
										displayName={displayName}
										preset={preset}
										signedIn={signedIn}
									/>
									<div className="grid flex-1 leading-tight">
										<span className="truncate font-medium">{displayName}</span>
										{signedIn && email && (
											<span className="truncate text-xs text-(--ink-muted)">
												{email}
											</span>
										)}
									</div>
								</div>
							</DropdownMenuLabel>

							<DropdownMenuSeparator />

							{/* Offline detail group. */}
							<DropdownMenuGroup>
								<OfflineToggle />
							</DropdownMenuGroup>

							<DropdownMenuSeparator />

							{/* Action group. */}
							<DropdownMenuGroup>
								<DropdownMenuItem asChild>
									<Link to="/profile" onClick={() => setOpenMobile(false)}>
										<UserRound />
										Edit profile
									</Link>
								</DropdownMenuItem>
								{signedIn && (
									<DropdownMenuItem asChild>
										<Link to="/billing" onClick={() => setOpenMobile(false)}>
											<CreditCard />
											Billing &amp; plan
										</Link>
									</DropdownMenuItem>
								)}
								{signedIn && (
									<DropdownMenuItem
										onSelect={() => {
											void signOut();
										}}
									>
										<LogOut />
										Sign out
									</DropdownMenuItem>
								)}
								{canSignIn && (
									<DropdownMenuItem onSelect={() => setSignInOpen(true)}>
										<LogIn />
										Sign in to sync
									</DropdownMenuItem>
								)}
							</DropdownMenuGroup>
						</DropdownMenuContent>
					</DropdownMenu>
				</SidebarMenuItem>
			</SidebarMenu>

			{/* Controlled so closing the dropdown doesn't unmount the dialog. */}
			<Dialog open={signInOpen} onOpenChange={setSignInOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle className="font-display">Sign in to sync</DialogTitle>
						<DialogDescription>
							Sign-in is just for sync. Browse and collect work fine without it.
							Want your Vault on every device? We'll email a magic link. No
							password, no snooping.
						</DialogDescription>
					</DialogHeader>
					<SignIn />
				</DialogContent>
			</Dialog>
		</>
	);
}

interface SyncAvatarProps {
	displayName: string;
	preset: string;
	signedIn: boolean;
}

/**
 * Collector avatar. In the collapsed icon rail — where the name + status line are
 * clipped — it shows a status dot in the corner; expanded, the labelled status
 * line under the name carries that signal, so the corner dot stays hidden.
 */
function SyncAvatar({ displayName, preset, signedIn }: SyncAvatarProps) {
	return (
		<span className="relative inline-flex shrink-0">
			<CollectorAvatar
				displayName={displayName}
				preset={preset}
				className="text-sm"
			/>
			<AccountStatusBadge
				signedIn={signedIn}
				className="hidden group-data-[collapsible=icon]:block"
			/>
		</span>
	);
}

/**
 * Decorative status dot pinned to the avatar's corner (collapsed rail only). The
 * accessible status text lives on {@link AccountStatusLine}, so this is hidden
 * from assistive tech to avoid a duplicate announcement.
 */
function AccountStatusBadge({
	signedIn,
	className,
}: {
	signedIn: boolean;
	className?: string;
}) {
	const { dotClass } = useAccountStatusDisplay(signedIn);
	return (
		<span
			aria-hidden
			className={cn(
				"absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-[var(--canvas)] motion-reduce:animate-none",
				dotClass,
				className,
			)}
		/>
	);
}

/** Dot + label shown under the display name in the trigger; always visible. */
function AccountStatusLine({ signedIn }: { signedIn: boolean }) {
	const { dotClass, label } = useAccountStatusDisplay(signedIn);
	return (
		<span
			role="status"
			aria-label={`Sync status: ${label}`}
			className="flex items-center gap-1.5"
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
		</span>
	);
}
