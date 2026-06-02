import { type ChangeEvent, useRef } from "react";
import { downloadSnapshot, parseSnapshot } from "../../store/userland/backup";
import {
	exportUserData,
	importUserData,
} from "../../store/userland/userland-store";

export function VaultBackupControls() {
	const fileRef = useRef<HTMLInputElement>(null);

	async function onExport() {
		downloadSnapshot(await exportUserData());
	}

	async function onImport(e: ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		if (!file) return;
		try {
			await importUserData(parseSnapshot(await file.text()), "replace");
		} catch (err) {
			alert(err instanceof Error ? err.message : "Import failed");
		} finally {
			if (fileRef.current) fileRef.current.value = "";
		}
	}

	return (
		<div className="flex gap-2">
			<button
				type="button"
				onClick={onExport}
				className="rounded border px-3 py-1.5 text-sm hover:bg-secondary"
			>
				Export backup
			</button>
			<button
				type="button"
				onClick={() => fileRef.current?.click()}
				className="rounded border px-3 py-1.5 text-sm hover:bg-secondary"
			>
				Import backup
			</button>
			<input
				ref={fileRef}
				type="file"
				accept="application/json"
				className="hidden"
				onChange={onImport}
			/>
		</div>
	);
}
