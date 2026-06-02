import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/vault/goals")({
	component: () => (
		<p className="py-12 text-center text-muted-foreground">
			Collection goals — coming soon.
		</p>
	),
});
