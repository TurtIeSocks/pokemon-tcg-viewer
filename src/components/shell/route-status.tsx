import {
	type ErrorComponentProps,
	Link,
	useRouter,
} from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { m } from "@/paraglide/messages";

/**
 * Router-wide pending UI. Shown when a navigation's loader runs past the
 * router's pending threshold (see router.tsx) — so a slow open shows motion
 * instead of a frozen page. Fast/preloaded navigations never reach it.
 */
export function RoutePending() {
	return (
		<output
			className="flex h-full items-center justify-center py-16"
			aria-label={m.route_loading_aria()}
		>
			<Loader2 className="size-6 animate-spin text-muted-foreground" />
		</output>
	);
}

/** Router-wide 404 UI. Rendered for every `throw notFound()` in a loader. */
export function RouteNotFound() {
	return (
		<div className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-3 px-4 py-16 text-center">
			<h1 className="text-2xl font-bold">{m.route_not_found_heading()}</h1>
			<p className="text-sm text-muted-foreground">
				{m.route_not_found_body()}
			</p>
			<Button asChild variant="outline" size="sm" className="mt-2">
				<Link to="/">{m.route_back_to_home()}</Link>
			</Button>
		</div>
	);
}

/** Router-wide error UI. Rendered when a loader or component throws. */
export function RouteError({ error }: ErrorComponentProps) {
	const router = useRouter();
	const message =
		error instanceof Error ? error.message : m.route_error_generic();
	// In dev, surface the real error (name + stack + cause) so a thrown loader
	// isn't an opaque "Something went wrong". Stays hidden in production.
	const detail =
		import.meta.env.DEV && error instanceof Error
			? `${error.name}: ${error.message}\n\n${error.stack ?? "(no stack)"}${
					error.cause != null ? `\n\nCaused by: ${String(error.cause)}` : ""
				}`
			: null;
	return (
		<div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center gap-3 px-4 py-16 text-center">
			<h1 className="text-2xl font-bold">{m.route_error_heading()}</h1>
			<p className="max-w-prose text-sm text-muted-foreground">{message}</p>
			{detail && (
				<pre className="mt-1 max-h-80 w-full overflow-auto whitespace-pre-wrap rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-left font-mono text-xs text-destructive">
					{detail}
				</pre>
			)}
			<div className="mt-2 flex gap-2">
				<Button variant="outline" size="sm" onClick={() => router.invalidate()}>
					{m.route_try_again()}
				</Button>
				<Button asChild variant="ghost" size="sm">
					<Link to="/">{m.route_back_to_home()}</Link>
				</Button>
			</div>
		</div>
	);
}
