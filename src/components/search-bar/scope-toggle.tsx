import { cn } from "@/lib/utils";
import { type SearchScope, useScopeParam } from "../../hooks/use-url-selection";

const OPTIONS: { value: SearchScope; label: string }[] = [
	{ value: "set", label: "This set" },
	{ value: "all", label: "All sets" },
];

export function ScopeToggle() {
	const [scope, setScope] = useScopeParam();
	return (
		<div
			className="inline-flex shrink-0 rounded-lg border border-border p-0.5 text-sm"
			role="radiogroup"
			aria-label="Search scope"
		>
			{OPTIONS.map((o) => (
				// biome-ignore lint/a11y/useSemanticElements: styled segmented control; native radio inputs would need bespoke restyling
				<button
					key={o.value}
					type="button"
					role="radio"
					aria-checked={scope === o.value}
					onClick={() => setScope(o.value)}
					className={cn(
						"rounded-md px-3 py-1 transition-colors",
						scope === o.value
							? "bg-primary text-primary-foreground"
							: "text-muted-foreground hover:text-foreground",
					)}
				>
					{o.label}
				</button>
			))}
		</div>
	);
}
