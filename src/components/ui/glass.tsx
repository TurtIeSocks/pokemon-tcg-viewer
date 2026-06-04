import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

interface GlassPanelProps extends ComponentProps<"div"> {
	interactive?: boolean;
}

export function GlassPanel({ interactive, className, ...props }: GlassPanelProps) {
	return (
		<div
			className={cn(
				"rounded-[var(--r-panel)] border border-[var(--border)] bg-[var(--glass)] backdrop-blur-xl shadow-[var(--shadow)]",
				interactive &&
					"transition-[transform,box-shadow,border-color] duration-300 ease-[var(--ease)] hover:-translate-y-1 hover:shadow-[var(--shadow-lift)] hover:border-[color-mix(in_oklch,var(--primary)_45%,var(--border))] motion-reduce:transition-none motion-reduce:hover:translate-y-0",
				className,
			)}
			{...props}
		/>
	);
}

export function BezelPanel({ className, children, ...props }: ComponentProps<"div">) {
	return (
		<div
			className={cn(
				"rounded-[calc(var(--r-panel)+6px)] border border-[var(--hairline)] bg-white/[0.04] p-1.5 backdrop-blur-xl",
				className,
			)}
			{...props}
		>
			<div className="rounded-[var(--r-panel)] bg-[var(--bg)] p-5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.10)]">
				{children}
			</div>
		</div>
	);
}
