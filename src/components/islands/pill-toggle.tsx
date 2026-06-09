import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ToggleButtonProps = React.ComponentProps<"button">;

/** Presentational pill chip. State + a11y attrs are supplied by the caller. */
export function ToggleButton({ className, ...props }: ToggleButtonProps) {
	return (
		<button
			type="button"
			className={cn(
				"inline-flex items-center gap-1.5 px-3 py-1.5 rounded-(--r-pill) border text-sm cursor-pointer transition-[background,color,border-color] duration-120 ease-out disabled:opacity-40 disabled:cursor-not-allowed",
				props["aria-pressed"]
					? "bg-primary border-transparent text-(--primary-ink) font-semibold"
					: "bg-(--glass) border-border text-(--ink-muted) hover:text-(--ink)",
				className,
			)}
			{...props}
		/>
	);
}

export interface PillToggleProps {
	value: boolean;
	onChange: (next: boolean) => void;
	/** Pill text; names the ON state ("Exact", "Timeline"). */
	label: string;
	/** Optional leading icon. Decorative — the label is the accessible name. */
	icon?: ReactNode;
	/** Tooltip + fuller a11y context when the label alone is ambiguous. */
	title?: string;
	disabled?: boolean;
}

/**
 * Single on/off pill. Pressed/filled = on (true), ghost = off (false).
 * For binary filters where a two-button group would be overkill.
 */
export function PillToggle({
	value,
	onChange,
	label,
	icon,
	title,
	disabled = false,
}: PillToggleProps) {
	return (
		<ToggleButton
			aria-pressed={value}
			disabled={disabled}
			title={title}
			onClick={() => onChange(!value)}
		>
			{icon}
			{label}
		</ToggleButton>
	);
}
