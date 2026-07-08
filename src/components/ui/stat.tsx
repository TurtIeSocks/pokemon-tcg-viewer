import { cn } from "@/lib/utils";

interface StatProps {
	value: string;
	label: string;
	tone?: "up" | "down";
}

export function Stat({ value, label, tone }: StatProps) {
	return (
		<div>
			<div
				className={cn(
					"font-mono text-2xl font-medium tabular-nums",
					tone === "up"
						? "text-(--success)"
						: tone === "down"
							? "text-(--danger)"
							: "text-(--ink)",
				)}
			>
				{value}
			</div>
			<div className="mt-0.5 text-[11px] uppercase tracking-wide text-(--faint)">
				{label}
			</div>
		</div>
	);
}
