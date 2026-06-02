import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/vault/sets")({
	component: () => (
		<p className="py-12 text-center text-muted-foreground">
			Set grid — coming soon.
		</p>
	),
});
