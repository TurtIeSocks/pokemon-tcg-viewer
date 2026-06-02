import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { parseSnapshot } from "../../store/userland/backup";
import type { UserDataSnapshot } from "../../store/userland/types";
import { importUserData } from "../../store/userland/userland-store";

/** Props for {@link ImportDialog}. */
interface ImportDialogProps {
	/** Whether the dialog is visible. */
	open: boolean;
	/** Called when the dialog requests open-state change; caller owns the state. */
	onOpenChange: (open: boolean) => void;
}

/** Dialog for importing a JSON backup; supports merge (additive) or replace (destructive) strategies. */
export function ImportDialog({ open, onOpenChange }: ImportDialogProps) {
	const [snapshot, setSnapshot] = useState<UserDataSnapshot | null>(null);
	const [error, setError] = useState<string | null>(null);
	const fileRef = useRef<HTMLInputElement>(null);

	function resetState() {
		setSnapshot(null);
		setError(null);
		if (fileRef.current) fileRef.current.value = "";
	}

	function handleOpenChange(nextOpen: boolean) {
		if (!nextOpen) resetState();
		onOpenChange(nextOpen);
	}

	async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		if (!file) return;
		setError(null);
		setSnapshot(null);
		try {
			const text = await file.text();
			const snap = parseSnapshot(text);
			setSnapshot(snap);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Import failed");
		}
	}

	async function onMerge() {
		if (!snapshot) return;
		await importUserData(snapshot, "merge");
		handleOpenChange(false);
	}

	async function onReplace() {
		if (!snapshot) return;
		const ok = window.confirm(
			"Replace your entire collection + binders with this backup?",
		);
		if (!ok) return;
		await importUserData(snapshot, "replace");
		handleOpenChange(false);
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Import backup</DialogTitle>
					<DialogDescription>
						Choose a JSON backup file to restore your collection and binders.
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-3">
					<input
						ref={fileRef}
						type="file"
						accept="application/json"
						onChange={onFileChange}
					/>

					{error && <p className="text-destructive text-sm">{error}</p>}

					{snapshot && (
						<p className="text-sm">
							{snapshot.collection.length} cards · {snapshot.binders.length}{" "}
							binders
						</p>
					)}
				</div>

				{snapshot && (
					<DialogFooter>
						<Button variant="outline" onClick={onMerge}>
							Merge
						</Button>
						<Button variant="destructive" onClick={onReplace}>
							Replace
						</Button>
					</DialogFooter>
				)}
			</DialogContent>
		</Dialog>
	);
}
