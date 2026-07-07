import { Link } from "@tanstack/react-router";
import { GlassPanel } from "@/components/ui/glass";
import { useIsActive } from "@/hooks/use-is-active";
import { cn } from "@/lib/utils";
import { useCommandPalette } from "../../store/command-palette";
import { BOTTOM_NAV_ITEMS, type BottomNavItem } from "./command-palette-data";

/**
 * Mobile-only bottom navigation — hidden at `md:`+ where the sidebar takes over.
 * A floating Liquid-Glass pill of primary destinations with Scan as a raised
 * accent FAB and a Search slot that opens the same {@link useCommandPalette}
 * store the header trigger toggles (no second palette instance). The wrapper
 * clears the iOS home indicator via `env(safe-area-inset-bottom)`; its footprint
 * is mirrored onto the scroll container's bottom padding in the root shell so
 * page content never hides behind the bar.
 */
export function BottomNav() {
	return (
		<nav
			aria-label="Primary"
			className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden"
		>
			<GlassPanel className="mx-auto flex max-w-md items-stretch justify-around gap-1 rounded-[26px] px-1 py-1.5">
				{BOTTOM_NAV_ITEMS.map((item) => (
					<BottomNavSlot key={item.label} item={item} />
				))}
			</GlassPanel>
		</nav>
	);
}

const SLOT_CLASS =
	"group flex flex-1 flex-col items-center justify-center gap-1 rounded-2xl py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]";

function BottomNavSlot({ item }: { item: BottomNavItem }) {
	const Icon = item.icon;
	const paletteOpen = useCommandPalette((s) => s.open);
	const setPaletteOpen = useCommandPalette((s) => s.setOpen);
	// Search slot has no route; route items match by prefix except Browse ("/"),
	// which must be exact or it would light up on every path.
	const routeActive = useIsActive(item.to ?? null, { exact: item.to === "/" });
	const active = item.action === "search" ? paletteOpen : routeActive;

	// Center FAB (Scan): the create/capture action, always accent-filled and
	// raised so it reads as the primary action of the bar.
	if (item.center && item.to) {
		return (
			<Link
				to={item.to}
				aria-label={item.label}
				aria-current={active ? "page" : undefined}
				className="group flex flex-1 flex-col items-center justify-center focus-visible:outline-none"
			>
				<span
					className={cn(
						"grid size-12 place-items-center rounded-full bg-[var(--primary)] text-[var(--primary-ink)] shadow-[0_10px_28px_-10px_var(--primary)] transition-transform duration-200 ease-[var(--ease)] group-hover:-translate-y-0.5 group-active:scale-95 group-focus-visible:ring-2 group-focus-visible:ring-[var(--primary)] group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-[var(--bg)] motion-reduce:transition-none motion-reduce:group-hover:translate-y-0",
						active &&
							"ring-2 ring-[var(--primary)] ring-offset-2 ring-offset-[var(--bg)]",
					)}
				>
					<Icon className="size-6" />
				</span>
			</Link>
		);
	}

	const content = (
		<>
			<Icon
				className={cn(
					"size-5 transition-colors motion-reduce:transition-none",
					active ? "text-[var(--primary)]" : "text-[var(--ink-muted)]",
				)}
			/>
			<span
				className={cn(
					"text-[10px] leading-none transition-colors motion-reduce:transition-none",
					active ? "text-[var(--primary)]" : "text-[var(--faint)]",
				)}
			>
				{item.label}
			</span>
		</>
	);

	if (item.action === "search") {
		return (
			<button
				type="button"
				aria-haspopup="dialog"
				aria-expanded={paletteOpen}
				onClick={() => setPaletteOpen(true)}
				className={SLOT_CLASS}
			>
				{content}
			</button>
		);
	}

	// Remaining items are all routes; guard keeps `to` defined for <Link>.
	if (!item.to) return null;

	return (
		<Link
			to={item.to}
			aria-current={active ? "page" : undefined}
			className={SLOT_CLASS}
		>
			{content}
		</Link>
	);
}
