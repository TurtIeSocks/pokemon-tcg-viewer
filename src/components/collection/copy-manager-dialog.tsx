import { Button } from "@/components/ui/button";
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
			<DialogContent className="flex flex-col max-h-[90dvh] max-w-2xl p-0 gap-0">
				{/* Header */}
				<div className="px-6 pt-6 pb-4 border-b">
					<DialogTitle>{name} — Copies</DialogTitle>
					<DialogDescription>
						Add, edit, or remove individual copies you own.
					</DialogDescription>
				</div>

				{/* Scrollable content */}
				<div className="flex-1 overflow-y-auto px-6 py-4">
					<CopyManager cardId={cardId} variants={variants} />
				</div>

				{/* Sticky bottom bar: Done button — the obvious exit */}
				<div className="px-6 py-4 border-t bg-background">
					<Button
						className="w-full"
						onClick={() => onOpenChange(false)}
						aria-label="Done"
					>
						Done
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
