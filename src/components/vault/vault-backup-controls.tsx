import { useState } from "react";
import { Button } from "@/components/ui/button";
import { m } from "@/paraglide/messages";
import { useStore } from "../../store";
import {
	resolveCardAcrossRegions,
	setsById,
} from "../../store/corpus/corpus-engine";
import { useCorpusRuntime } from "../../store/corpus/corpus-runtime";
import { allLoadedSets } from "../../store/sets-slice";
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

/** Export the full collection as a downloadable JSON backup. */
async function exportBackup(): Promise<void> {
	downloadSnapshot(await exportUserData());
}

/** Toolbar: JSON backup export, CSV export (per-stack + per-card), and import. */
export function VaultBackupControls() {
	const [importOpen, setImportOpen] = useState(false);
	const items = useUserland((s) => s.items);
	// Resolve owned cards across ALL loaded regions (ids are globally unique), so
	// an owned Asian card exports with real name/number rather than blank. setName
	// joins every loaded region's sets too (allLoadedSets, deduped by id), so an
	// Asian set exports its real name instead of falling back to its id.
	const indices = useCorpusRuntime((s) => s.indices);
	const sets = useStore(allLoadedSets);

	function exportCsv(mode: CsvMode) {
		const byId = sets ? setsById(sets) : null;
		const resolve = (cardId: string) => {
			const c = resolveCardAcrossRegions(cardId, indices);
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
			<Button variant="secondary" size="sm" onClick={exportBackup}>
				{m.vault_export_backup()}
			</Button>
			<Button variant="secondary" size="sm" onClick={() => exportCsv("stack")}>
				{m.vault_export_csv_stacks()}
			</Button>
			<Button variant="secondary" size="sm" onClick={() => exportCsv("copy")}>
				{m.vault_export_csv_per_card()}
			</Button>
			<Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
				{m.vault_import_backup_button()}
			</Button>
			<ImportDialog open={importOpen} onOpenChange={setImportOpen} />
		</div>
	);
}
