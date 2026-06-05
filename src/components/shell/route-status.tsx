import {
	type ErrorComponentProps,
	Link,
	useRouter,
} from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Router-wide pending UI. Shown when a navigation's loader runs past the
 * router's pending threshold (see router.tsx) — so a slow open shows motion
 * instead of a frozen page. Fast/preloaded navigations never reach it.
 */
export function RoutePending() {
	return (
		<output
			className="flex h-full items-center justify-center py-16"
			aria-label="Loading"
		>
			<Loader2 className="size-6 animate-spin text-muted-foreground" />
		</output>
	);
}

/** Router-wide 404 UI. Rendered for every `throw notFound()` in a loader. */
export function RouteNotFound() {
	return (
		<div className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-3 px-4 py-16 text-center">
			<h1 className="text-2xl font-bold">Not found</h1>
			<p className="text-sm text-muted-foreground">
				That page, set, or card doesn’t exist — it may have moved or never
				existed.
			</p>
			<Button asChild variant="outline" size="sm" className="mt-2">
				<Link to="/">Back to home</Link>
			</Button>
		</div>
	);
}

/** Router-wide error UI. Rendered when a loader or component throws. */
export function RouteError({ error }: ErrorComponentProps) {
	const router = useRouter();
	const message =
		error instanceof Error ? error.message : "Something went wrong.";
	return (
		<div className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-3 px-4 py-16 text-center">
			<h1 className="text-2xl font-bold">Something went wrong</h1>
			<p className="max-w-prose text-sm text-muted-foreground">{message}</p>
			<div className="mt-2 flex gap-2">
				<Button variant="outline" size="sm" onClick={() => router.invalidate()}>
					Try again
				</Button>
				<Button asChild variant="ghost" size="sm">
					<Link to="/">Back to home</Link>
				</Button>
			</div>
		</div>
	);
}
