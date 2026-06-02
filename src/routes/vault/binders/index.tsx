import {
	ClientOnly,
	createFileRoute,
	useNavigate,
} from "@tanstack/react-router";
import { useState } from "react";
import { BinderCard } from "@/components/binders/binder-card";
import { BinderFormDialog } from "@/components/binders/binder-form-dialog";
import { Button } from "@/components/ui/button";
import { useEnsureCorpus } from "@/store/corpus/use-ensure-corpus";
import type { Binder } from "@/store/userland/types";
import { useUserland } from "@/store/userland/userland-store";

export const Route = createFileRoute("/vault/binders/")({
	component: VaultBinders,
});

/** Exported for tests; wrap in a router context when rendering standalone. */
export function VaultBindersInner() {
	useEnsureCorpus();
	const navigate = useNavigate();
	const [newOpen, setNewOpen] = useState(false);
	const bindersMap = useUserland((s) => s.binders);
	const binders = Object.values(bindersMap);

	function handleSaved(binder: Binder) {
		void navigate({
			to: "/vault/binders/$binderId",
			params: { binderId: binder.id },
		});
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<h1 className="text-2xl font-bold">Binders</h1>
				<Button onClick={() => setNewOpen(true)}>New binder</Button>
			</div>

			{binders.length === 0 ? (
				<p className="py-12 text-center text-muted-foreground">
					No binders yet — create one to organize your card collection.
				</p>
			) : (
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{binders.map((binder) => (
						<BinderCard key={binder.id} binder={binder} />
					))}
				</div>
			)}

			<BinderFormDialog
				open={newOpen}
				onOpenChange={setNewOpen}
				onSaved={handleSaved}
			/>
		</div>
	);
}

function VaultBinders() {
	return (
		<ClientOnly
			fallback={
				<p className="py-12 text-center text-muted-foreground">
					Loading binders…
				</p>
			}
		>
			<VaultBindersInner />
		</ClientOnly>
	);
}
