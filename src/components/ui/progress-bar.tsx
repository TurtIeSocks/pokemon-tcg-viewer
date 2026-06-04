import { cn } from "@/lib/utils";

/** A horizontal owned/total completion bar. `className` overrides the track height. */
export function ProgressBar({
	value,
	total,
	className,
}: {
	value: number;
	total: number;
	className?: string;
}) {
	const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
	return (
		<div className={cn("h-2 overflow-hidden rounded-full bg-white/[0.08]", className)}>
			<div
				className="h-full rounded-full bg-gradient-to-r from-[var(--primary)] to-[var(--primary-strong)] transition-[width]"
				style={{ width: `${pct}%` }}
			/>
		</div>
	);
}
