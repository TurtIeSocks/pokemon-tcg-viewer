import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "../ui/dialog";
import { CopyManager } from "./copy-manager";

/** Controlled Dialog wrapping the CopyManager for a card. Callers own the open state + trigger. */
export function CopyManagerDialog({
	cardId,
	variants,
	name,
	open,
	onOpenChange,
}: {
	cardId: string;
	variants?: string[];
	name: string;
	open: boolean;
	onOpenChange: (o: boolean) => void;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogTitle>{name} — Copies</DialogTitle>
				<DialogDescription>
					Add, edit, or remove individual copies you own.
				</DialogDescription>
				<CopyManager cardId={cardId} variants={variants} />
			</DialogContent>
		</Dialog>
	);
}
