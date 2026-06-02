import { useState } from "react";
import { downloadSnapshot } from "../../store/userland/backup";
import { exportUserData } from "../../store/userland/userland-store";
import { ImportDialog } from "./import-dialog";

export function VaultBackupControls() {
	const [importOpen, setImportOpen] = useState(false);

	async function onExport() {
		downloadSnapshot(await exportUserData());
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
				onClick={() => setImportOpen(true)}
				className="rounded border px-3 py-1.5 text-sm hover:bg-secondary"
			>
				Import backup
			</button>
			<ImportDialog open={importOpen} onOpenChange={setImportOpen} />
		</div>
	);
}
