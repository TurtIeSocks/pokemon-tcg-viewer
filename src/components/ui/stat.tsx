import { cn } from "@/lib/utils";

interface StatProps {
	value: string;
	label: string;
	tone?: "up";
}

export function Stat({ value, label, tone }: StatProps) {
	return (
		<div>
			<div
				className={cn(
					"font-mono text-2xl font-medium tabular-nums",
					tone === "up" ? "text-[var(--success)]" : "text-[var(--ink)]",
				)}
			>
				{value}
			</div>
			<div className="mt-0.5 text-[11px] uppercase tracking-wide text-[var(--faint)]">
				{label}
			</div>
		</div>
	);
}
