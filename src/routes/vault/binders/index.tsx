import {
	ClientOnly,
	createFileRoute,
	useNavigate,
} from "@tanstack/react-router";
import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
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
	// Subscribe to the id-list (structure) only; each BinderCard reads its own
	// binder by id (S3), so a content edit re-renders just that card.
	const binderIds = useUserland(useShallow((s) => Object.keys(s.binders)));

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
				subtitle="Lists that fill themselves by rule, plus the ones you hand-pick."
				actions={<Button onClick={() => setNewOpen(true)}>New binder</Button>}
			/>

			{binderIds.length === 0 ? (
				<p className="py-12 text-center text-muted-foreground">
					No binders yet. Make one to group the cards that go together.
				</p>
			) : (
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{binderIds.map((id) => (
						<BinderCard key={id} binderId={id} />
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
