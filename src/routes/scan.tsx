// scan.tsx
import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { useEnsureCorpus } from "../store/corpus/use-ensure-corpus";

// R1/R4: ScanView dynamic-imports Tesseract.js internally (via getOcr), but
// the component itself is also lazy-loaded here so importing this route file
// (e.g. for route-tree typegen, or a nav link elsewhere) never pulls the
// camera/OCR UI code into another route's bundle.
const ScanView = lazy(() =>
	import("../components/scan/scan-view").then((m) => ({ default: m.ScanView })),
);

export const Route = createFileRoute("/scan")({
	head: () => ({ meta: [{ title: "Scan a card · Cardstack" }] }),
	component: ScanPage,
});

function ScanPage() {
	useEnsureCorpus();
	return (
		<div className="mx-auto w-full max-w-md px-4 py-6">
			<h1 className="mb-4 font-display text-2xl text-(--ink)">
				Scan a card
			</h1>
			<Suspense
				fallback={
					<div className="text-(--ink-muted)">Loading scanner…</div>
				}
			>
				<ScanView />
			</Suspense>
		</div>
	);
}
