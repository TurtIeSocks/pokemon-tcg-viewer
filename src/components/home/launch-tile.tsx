import { createLink } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { type ComponentPropsWithoutRef, forwardRef } from "react";
import { cn } from "@/lib/utils";

/**
 * A big Liquid-Glass launch-pad tile — the home page's primary navigation, in
 * the same visual dialect as `<SetTile>` (violet color field → frosted pane →
 * hover sheen → crisp content). Two interactive shells over one shared face:
 *
 *  - {@link LaunchTileLink} — a typed router link (via `createLink`), for the
 *    card-type + Vault destinations. Keeps full `to`/`search` inference.
 *  - {@link LaunchTileButton} — a plain button, for the Search card (opens the
 *    command palette) and the Browse-by-era card (scrolls to its section).
 *
 * The face component + shared outer class stay private so this file exports only
 * components (no react-refresh boundary noise).
 */

interface LaunchFaceProps {
	icon: LucideIcon;
	title: string;
	subtitle: string;
}

// Outer interactive element: the hover lift, focus ring, and `group` anchor for
// the sheen sweep. Motion is fully guarded. Applied to the <a>/<button>; the
// glass layers + content live in the clipped <LaunchFace> below.
const TILE_OUTER =
	"group block w-full rounded-2xl text-left transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_12px_30px_-8px_rgba(0,0,0,0.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none motion-reduce:hover:translate-y-0";

/** The shared Liquid-Glass face: color field, frosted pane, sheen, and content. */
function LaunchFace({ icon: Icon, title, subtitle }: LaunchFaceProps) {
	return (
		<span className="relative flex aspect-[4/3] w-full flex-col justify-between overflow-hidden rounded-2xl p-4 sm:p-5">
			{/* ── Color backdrop: a violet glow + base darkening for legibility ── */}
			<span
				aria-hidden="true"
				className="absolute inset-0 bg-[radial-gradient(120%_120%_at_50%_-10%,var(--primary-wash),transparent_62%)]"
			/>
			<span
				aria-hidden="true"
				className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/5 to-black/60"
			/>

			{/* ── Frosted glass pane: blur + film + bright top edge + inset depth ── */}
			<span
				aria-hidden="true"
				className="absolute inset-0 rounded-2xl border border-white/10 bg-white/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.28),inset_0_-1px_0_rgba(0,0,0,0.35)] backdrop-blur-xl"
			/>

			{/* ── Specular sheen sweep on hover ── */}
			<span
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/15 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full motion-reduce:hidden"
			/>

			{/* ── Content: glass icon chip up top, title + subtitle at the base ── */}
			<span className="relative z-10 flex size-11 items-center justify-center rounded-[var(--r-control)] border border-white/15 bg-white/[0.08] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]">
				<Icon className="size-5" aria-hidden="true" />
			</span>
			<span className="relative z-10 flex flex-col gap-1">
				<span className="font-display text-lg font-semibold text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.55)]">
					{title}
				</span>
				<span className="text-sm text-white/70 drop-shadow-[0_1px_6px_rgba(0,0,0,0.5)]">
					{subtitle}
				</span>
			</span>
		</span>
	);
}

interface LaunchAnchorProps
	extends Omit<ComponentPropsWithoutRef<"a">, "title">,
		LaunchFaceProps {}

/**
 * Anchor base for {@link LaunchTileLink}. `createLink` resolves the router props
 * (`to`/`search`/`params` → `href`, active state, prefetch) and forwards them
 * here as plain anchor props; the launch-specific extras ride alongside.
 */
const LaunchAnchor = forwardRef<HTMLAnchorElement, LaunchAnchorProps>(
	(
		{ icon, title, subtitle, className, children: _children, ...anchor },
		ref,
	) => (
		<a ref={ref} className={cn(TILE_OUTER, className)} {...anchor}>
			<LaunchFace icon={icon} title={title} subtitle={subtitle} />
		</a>
	),
);
LaunchAnchor.displayName = "LaunchAnchor";

/** Typed router-link launch tile (card-type pages, Vault). */
export const LaunchTileLink = createLink(LaunchAnchor);

interface LaunchTileButtonProps extends LaunchFaceProps {
	onClick: () => void;
}

/** Button launch tile (Search → command palette, Browse-by-era → scroll). */
export function LaunchTileButton({ onClick, ...face }: LaunchTileButtonProps) {
	return (
		<button type="button" onClick={onClick} className={TILE_OUTER}>
			<LaunchFace {...face} />
		</button>
	);
}
