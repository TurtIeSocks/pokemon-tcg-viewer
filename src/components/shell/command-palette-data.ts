import type { LinkProps } from "@tanstack/react-router";
import {
	BookOpen,
	Boxes,
	CreditCard,
	Home,
	Layers,
	LayoutDashboard,
	type LucideIcon,
	ScanLine,
	Search,
	UserRound,
} from "lucide-react";
import { m } from "@/paraglide/messages";

export interface NavDestination {
	/**
	 * Thunk, not a plain string: Paraglide's `m.*()` reads the ACTIVE locale
	 * when CALLED, so resolving it into a string here (at module-eval time)
	 * would freeze the base locale forever. Callers invoke `label()` at
	 * render time instead.
	 */
	label: () => string;
	to: LinkProps["to"];
	icon: LucideIcon;
	/** Extra terms folded into the match text (the palette filters by substring). */
	keywords?: string;
}

/** Static "jump to page" destinations shown in the palette's nav group. */
export const NAV_DESTINATIONS: readonly NavDestination[] = [
	{
		label: () => m.command_palette_nav_browse(),
		to: "/",
		icon: Home,
		keywords: "home series sets catalog",
	},
	{
		label: () => m.command_palette_nav_vault_overview(),
		to: "/vault",
		icon: LayoutDashboard,
		keywords: "dashboard stats",
	},
	{
		label: () => m.command_palette_nav_all_cards(),
		to: "/vault/cards",
		icon: Layers,
		keywords: "collection owned",
	},
	{
		label: () => m.command_palette_nav_sets_progress(),
		to: "/vault/sets",
		icon: Boxes,
		keywords: "completion",
	},
	{
		label: () => m.command_palette_nav_binders(),
		to: "/vault/binders",
		icon: BookOpen,
		keywords: "goals lists",
	},
	{
		label: () => m.command_palette_nav_scan_cards(),
		to: "/scan",
		icon: ScanLine,
		keywords: "camera ocr add",
	},
	{
		label: () => m.command_palette_nav_profile(),
		to: "/profile",
		icon: UserRound,
		keywords: "account",
	},
	{
		label: () => m.command_palette_nav_billing(),
		to: "/billing",
		icon: CreditCard,
		keywords: "plan subscription upgrade",
	},
];

/**
 * One slot in the mobile-only bottom nav. Either a route (`to`) or the single
 * `action: "search"` slot that opens the ⌘K palette. `center` marks the raised
 * accent FAB (Scan). Route + icon are reused from {@link NAV_DESTINATIONS} via
 * {@link dest} so the bottom nav never re-declares a route — the short `label`
 * and `center` flag are the only bottom-nav-specific presentation.
 */
export interface BottomNavItem {
	/** See {@link NavDestination.label} — a thunk, resolved at render time. */
	label: () => string;
	icon: LucideIcon;
	to?: LinkProps["to"];
	action?: "search";
	center?: boolean;
}

/** Pull a destination's route + icon by route, overriding the label for the bar. */
function dest(
	to: LinkProps["to"],
	label: () => string,
	extra?: Partial<BottomNavItem>,
): BottomNavItem {
	const d = NAV_DESTINATIONS.find((n) => n.to === to);
	if (!d) throw new Error(`bottom-nav: no destination for route ${String(to)}`);
	return { label, to: d.to, icon: d.icon, ...extra };
}

/** Ordered slots for the mobile bottom nav (Scan is the center FAB). */
export const BOTTOM_NAV_ITEMS: readonly BottomNavItem[] = [
	dest("/", () => m.command_palette_nav_browse()),
	dest("/vault", () => m.bottom_nav_vault()),
	dest("/scan", () => m.nav_scan(), { center: true }),
	{ label: () => m.nav_search(), icon: Search, action: "search" },
	dest("/profile", () => m.command_palette_nav_profile()),
];
