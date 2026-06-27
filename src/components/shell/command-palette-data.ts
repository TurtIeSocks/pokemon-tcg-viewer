import type { LinkProps } from "@tanstack/react-router";
import {
	BookOpen,
	Boxes,
	CreditCard,
	Home,
	Layers,
	LayoutDashboard,
	type LucideIcon,
	UserRound,
} from "lucide-react";

export interface NavDestination {
	label: string;
	to: LinkProps["to"];
	icon: LucideIcon;
	/** Extra terms folded into the match text (the palette filters by substring). */
	keywords?: string;
}

/** Static "jump to page" destinations shown in the palette's nav group. */
export const NAV_DESTINATIONS: readonly NavDestination[] = [
	{
		label: "Browse",
		to: "/",
		icon: Home,
		keywords: "home series sets catalog",
	},
	{
		label: "Vault Overview",
		to: "/vault",
		icon: LayoutDashboard,
		keywords: "dashboard stats",
	},
	{
		label: "All Cards",
		to: "/vault/cards",
		icon: Layers,
		keywords: "collection owned",
	},
	{
		label: "Sets Progress",
		to: "/vault/sets",
		icon: Boxes,
		keywords: "completion",
	},
	{
		label: "Binders",
		to: "/vault/binders",
		icon: BookOpen,
		keywords: "goals lists",
	},
	{ label: "Profile", to: "/profile", icon: UserRound, keywords: "account" },
	{
		label: "Billing",
		to: "/billing",
		icon: CreditCard,
		keywords: "plan subscription upgrade",
	},
];
