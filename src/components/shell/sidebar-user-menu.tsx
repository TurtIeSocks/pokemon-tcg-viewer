"use client";

import { Link } from "@tanstack/react-router";
import {
	ChevronsUpDown,
	CreditCard,
	LogIn,
	LogOut,
	Settings,
	Sparkles,
	UserRound,
} from "lucide-react";
import { useState } from "react";
import { signOut } from "@/components/auth/auth-actions";
import { SignIn } from "@/components/auth/sign-in";
import { useAuthSession } from "@/components/auth/use-auth-session";
import { DEFAULT_AVATAR_PRESET_ID } from "@/components/profile/avatar-presets";
import { CollectorAvatar } from "@/components/profile/collector-avatar";
import { ProfileFormDialog } from "@/components/profile/profile-form-dialog";
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
import { m } from "@/paraglide/messages";
import { useUserland } from "@/store/userland/userland-store";

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
	const [editOpen, setEditOpen] = useState(false);

	const cloud = isCloudEnabled();
	const displayName = profile?.displayName || m.profile_default_display_name();
	const preset = profile?.avatarPreset ?? DEFAULT_AVATAR_PRESET_ID;
	// `ready` gates auth-derived UI so we don't flash sign-in/out before the
	// initial session check resolves.
	const signedIn = cloud && ready && Boolean(session);
	const canSignIn = cloud && ready && !session;

	return (
		<>
			<SidebarMenu>
				<SidebarMenuItem>
					<DropdownMenu>
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
							{/* Info group: identity links to the full profile page. Rendered
							    as a real menu item (not a bare label) so it's keyboard- and
							    pointer-focusable. */}
							<DropdownMenuItem asChild className="font-normal">
								<Link
									to="/profile"
									onClick={() => setOpenMobile(false)}
									className="text-left"
								>
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
								</Link>
							</DropdownMenuItem>

							<DropdownMenuSeparator />

							{/* Action group. */}
							<DropdownMenuGroup>
								<UpgradeToSyncItem
									signedIn={signedIn}
									onNavigate={() => setOpenMobile(false)}
								/>
								<DropdownMenuItem asChild>
									<Link to="/settings" onClick={() => setOpenMobile(false)}>
										<Settings />
										{m.shell_settings()}
									</Link>
								</DropdownMenuItem>
								<DropdownMenuItem onSelect={() => setEditOpen(true)}>
									<UserRound />
									{m.profile_edit_button()}
								</DropdownMenuItem>
								{signedIn && (
									<DropdownMenuItem asChild>
										<Link to="/billing" onClick={() => setOpenMobile(false)}>
											<CreditCard />
											{m.billing_heading()}
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
										{m.shell_sign_out()}
									</DropdownMenuItem>
								)}
								{canSignIn && (
									<DropdownMenuItem onSelect={() => setSignInOpen(true)}>
										<LogIn />
										{m.shell_sign_in_to_sync()}
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
						<DialogTitle className="font-display">
							{m.shell_sign_in_to_sync()}
						</DialogTitle>
						<DialogDescription>
							{m.shell_sign_in_dialog_description()}
						</DialogDescription>
					</DialogHeader>
					<SignIn />
				</DialogContent>
			</Dialog>

			{/* Edit-profile modal, opened straight from the menu (no route nav) and
			    controlled so the menu closing on select can't unmount it. */}
			<ProfileFormDialog
				open={editOpen}
				onOpenChange={setEditOpen}
				profile={profile}
			/>
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
				"absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-(--canvas) motion-reduce:animate-none",
				dotClass,
				className,
			)}
		/>
	);
}

/**
 * Dot + label shown under the display name in the trigger; always visible.
 * Strictly non-interactive: it lives inside the DropdownMenuTrigger's button,
 * where nested interactive elements are invalid HTML and break the trigger.
 * The needs_upgrade affordance lives in {@link UpgradeToSyncItem} instead.
 */
function AccountStatusLine({ signedIn }: { signedIn: boolean }) {
	const { dotClass, label } = useAccountStatusDisplay(signedIn);
	return (
		<span
			role="status"
			aria-label={m.shell_sync_status_aria({ label: label() })}
			className="flex items-center gap-1.5"
		>
			<span
				className={cn(
					"size-1.5 shrink-0 rounded-full motion-reduce:animate-none",
					dotClass,
				)}
			/>
			<span className="truncate font-mono text-[10px] text-(--faint) tabular-nums">
				{label()}
			</span>
		</span>
	);
}

/**
 * Upgrade CTA menu item, shown only while sync is blocked on `needs_upgrade`
 * (a cloud write was RLS-rejected for a free/lapsed account). Rendered as a
 * proper menu item — the trigger's status line stays non-interactive. Visible
 * text is the accessible name; no aria-label override.
 */
function UpgradeToSyncItem({
	signedIn,
	onNavigate,
}: {
	signedIn: boolean;
	onNavigate: () => void;
}) {
	const { status } = useAccountStatusDisplay(signedIn);
	if (!signedIn || status !== "needs_upgrade") return null;
	return (
		<DropdownMenuItem asChild>
			<Link
				to="/billing"
				onClick={onNavigate}
				className="text-(--primary) focus:text-(--primary) [&_svg]:text-(--primary)"
			>
				<Sparkles />
				{m.shell_upgrade_to_sync()}
			</Link>
		</DropdownMenuItem>
	);
}
