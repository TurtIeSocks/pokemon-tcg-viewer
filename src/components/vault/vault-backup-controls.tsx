import { useState } from "react";
import { useStore } from "../../store";
import { setsById } from "../../store/corpus/corpus-engine";
import { useCorpusRuntime } from "../../store/corpus/corpus-runtime";
import { downloadSnapshot } from "../../store/userland/backup";
import {
	type CsvMode,
	csvFilename,
	downloadCsv,
	stacksToCsv,
} from "../../store/userland/csv";
import {
	exportUserData,
	useUserland,
} from "../../store/userland/userland-store";
import { ImportDialog } from "./import-dialog";

const BTN = "rounded border px-3 py-1.5 text-sm hover:bg-secondary";

/** Toolbar: JSON backup export, CSV export (per-stack + per-card), and import. */
export function VaultBackupControls() {
	const [importOpen, setImportOpen] = useState(false);
	const items = useUserland((s) => s.items);
	const index = useCorpusRuntime((s) => s.index);
	const sets = useStore((s) => s.sets);

	async function onExport() {
		downloadSnapshot(await exportUserData());
	}

	function exportCsv(mode: CsvMode) {
		const byId = sets ? setsById(sets) : null;
		const resolve = (cardId: string) => {
			const c = index?.byId.get(cardId);
			if (!c) return undefined;
			const set = byId?.get(c.setId);
			return {
				name: c.name,
				setId: c.setId,
				setName: set?.name ?? c.setId,
				number: c.number,
			};
		};
		downloadCsv(
			stacksToCsv(Object.values(items), mode, resolve),
			csvFilename(new Date(), mode),
		);
	}

	return (
		<div className="flex flex-wrap gap-2">
			<button type="button" onClick={onExport} className={BTN}>
				Export backup
			</button>
			<button type="button" onClick={() => exportCsv("stack")} className={BTN}>
				Export CSV (stacks)
			</button>
			<button type="button" onClick={() => exportCsv("copy")} className={BTN}>
				Export CSV (per card)
			</button>
			<button type="button" onClick={() => setImportOpen(true)} className={BTN}>
				Import backup
			</button>
			<ImportDialog open={importOpen} onOpenChange={setImportOpen} />
		</div>
	);
}
