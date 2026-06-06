import { cn } from "@/lib/utils";

export interface ToggleOption<T> {
	value: T;
	label: string;
}

export interface ToggleGroupProps<T>
	extends Omit<ToggleFieldProps, "onChange"> {
	value: T;
	onChange: (next: T) => void;
	options: ToggleOption<T>[];
}

/** All-In-One for convenience */
export function ToggleGroup<T>({
	value,
	options,
	onChange,
	children,
	...rest
}: ToggleGroupProps<T>) {
	return (
		<ToggleField {...rest}>
			{options.map((opt) => (
				<ToggleButton
					key={String(opt.value)}
					aria-pressed={opt.value === value}
					onClick={() => onChange(opt.value)}
				>
					{opt.label}
				</ToggleButton>
			))}
			{children}
		</ToggleField>
	);
}

export type ToggleFieldProps = React.ComponentProps<"fieldset">;
/**
 * Basic parent component. fieldset + aria-label (over div + role="group")
 * satisfies Biome's useSemanticElements; a native disabled fieldset also
 * disables every ToggleButton inside it. Tailwind resets the default
 * border/padding/margin/min-inline-size.
 */
export function ToggleField({ className, ...props }: ToggleFieldProps) {
	return (
		<fieldset
			className={cn(
				"inline-flex rounded-(--r-pill) bg-(--glass) border border-border p-0.5 m-0 min-w-0",
				className,
			)}
			{...props}
		/>
	);
}

export type ToggleButtonProps = React.ComponentProps<"button">;
/** Basic child component */
export function ToggleButton({ className, ...props }: ToggleButtonProps) {
	return (
		<button
			type="button"
			className={cn(
				"px-3 py-1.5 bg-transparent border-none rounded-(--r-pill) text-sm cursor-pointer transition-[background,color] duration-120 ease-out text-(--ink-muted) hover:text-(--ink) disabled:opacity-40 disabled:cursor-not-allowed",
				props["aria-pressed"] ? "bg-primary text-white font-semibold" : "",
				className,
			)}
			{...props}
		/>
	);
}
