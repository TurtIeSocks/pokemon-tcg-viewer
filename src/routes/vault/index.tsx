import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/vault/")({
	beforeLoad: () => {
		throw redirect({ to: "/vault/cards" });
	},
});
