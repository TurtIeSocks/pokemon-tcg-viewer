import { ClientOnly, createFileRoute, Link } from "@tanstack/react-router";
import { BinderDetail } from "@/components/binders/binder-detail";
import { useEnsureCorpus } from "@/store/corpus/use-ensure-corpus";
import { useUserland } from "@/store/userland/userland-store";

export const Route = createFileRoute("/vault/binders/$binderId")({
	component: VaultBinderDetail,
});

function VaultBinderDetailInner() {
	useEnsureCorpus();
	const { binderId } = Route.useParams();
	const binder = useUserland((s) => s.binders[binderId]);

	if (!binder) {
		return (
			<div className="py-12 text-center space-y-4">
				<p className="text-muted-foreground">Binder not found.</p>
				<Link
					to="/vault/binders"
					className="text-sm underline text-muted-foreground hover:text-foreground"
				>
					Back to binders
				</Link>
			</div>
		);
	}

	return <BinderDetail binder={binder} />;
}

function VaultBinderDetail() {
	return (
		<ClientOnly
			fallback={
				<p className="py-12 text-center text-muted-foreground">
					Loading binder…
				</p>
			}
		>
			<VaultBinderDetailInner />
		</ClientOnly>
	);
}
