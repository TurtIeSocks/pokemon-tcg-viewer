import {
	ClientOnly,
	createFileRoute,
	useNavigate,
} from "@tanstack/react-router";
import { useState } from "react";
import { BinderCard } from "@/components/binders/binder-card";
import { BinderFormDialog } from "@/components/binders/binder-form-dialog";
import { Button } from "@/components/ui/button";
import { VaultPageHeader } from "@/components/vault/vault-page-header";
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
		<div className="space-y-8">
			<VaultPageHeader
				title="Binders"
				subtitle="Curated lists with smart rules and manual picks."
				actions={<Button onClick={() => setNewOpen(true)}>New binder</Button>}
			/>

			{binders.length === 0 ? (
				<p className="py-12 text-center text-muted-foreground">
					No binders yet. Create one to organize your card collection.
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
