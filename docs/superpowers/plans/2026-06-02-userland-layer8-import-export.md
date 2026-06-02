# User-land Layer 8 — Import/Export Polish — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Replace the foundation's alert-on-error import with a proper **Import dialog**: file → parse → summary or inline error → **Merge** or **Replace** (Replace confirmed). Export stays.

**Design:** approved roadmap Layer 8. Reuses `parseSnapshot` + `importUserData(snap, mode)` + `downloadSnapshot`/`exportUserData`.

**Tech Stack:** React 19, shadcn `Dialog`, existing backup engine, Bun test + RTL.

---

## Conventions
- Test `bun test <path>`; typecheck `bunx tsc -b` (0); lint `bunx biome check --write <files>`. IDB-injected repo harness in tests. `git add` explicit paths.

## File structure
| File | Change |
|---|---|
| `src/components/vault/import-dialog.tsx` (new) | file → parse → summary/error → merge/replace |
| `src/components/vault/vault-backup-controls.tsx` | "Import backup" opens `ImportDialog` (keep Export) |

---

### Task 1: `ImportDialog`

**Files:** create `src/components/vault/import-dialog.tsx` (+ `.test.tsx`)

Contract: `ImportDialog({ open, onOpenChange })`. shadcn `Dialog` (Title + Description for a11y). Body:
- A file input ("Choose backup file" / drag-drop optional). On change: read `file.text()` → `parseSnapshot` in a try/catch.
  - **catch** → set an inline error state (`<p className="text-destructive text-sm">{message}</p>`), keep the dialog open.
  - **success** → store the parsed `snapshot` + show a summary: `"{snapshot.collection.length} cards · {snapshot.goals.length} goals"`.
- When a valid snapshot is loaded, show two buttons:
  - **Merge** → `await importUserData(snapshot, "merge")` → close + (optional) success note.
  - **Replace** → `window.confirm("Replace your entire collection + goals with this backup?")` → if ok, `await importUserData(snapshot, "replace")` → close.
- Reset state (file, snapshot, error) on close/reopen.

- [ ] **Step 1: failing tests** (injected-repo harness; build a valid `UserDataSnapshot` JSON `File`)

```tsx
// import-dialog.test.tsx
// 1. invalid JSON file → inline error shown, no import
// 2. valid snapshot → summary "N cards · M goals" shown; click Merge → importUserData merge (assert store gains the items); click Replace (stub window.confirm=true) → replace.
```
Concrete: create `new File([JSON.stringify(snapshot)], "b.json", { type: "application/json" })`; fire change on the file input (`fireEvent.change(input, { target: { files: [file] } })`); `await waitFor` the summary; then click Merge/Replace and assert `useUserland.getState().items`/`goals`. Stub `window.confirm`/`window.alert`. Use `parseSnapshot`/`importUserData` from `../../store/userland/{backup,userland-store}`.

- [ ] **Step 2–4:** implement; run → pass; lint; commit (`feat(vault): import dialog with merge/replace + error surfacing`).

> File reading in happy-dom: `File.text()` is supported. If a test's `file.text()` is flaky, read via `await file.text()` in the handler (already the design) — keep the handler `async`.

---

### Task 2: wire into `VaultBackupControls`

**Files:** `src/components/vault/vault-backup-controls.tsx`

- [ ] Replace the inline file-input + `importUserData(...,"replace")` import handler with: an **"Import backup"** `Button` that opens `<ImportDialog>` (local `open` state). Keep **"Export backup"** as-is (`exportUserData` + `downloadSnapshot`). Remove the old `fileRef`/`onImport`/alert path.
- [ ] If `vault-backup-controls.test.tsx` asserted the old hidden file input, update it (Import now opens a dialog; assert the dialog opens / the Export button still works).
- [ ] `bunx tsc -b` 0 + `bun test` all pass. Lint. Commit (`feat(vault): use import dialog in vault backup controls`).

---

### Task 3: Verify + smoke + review

- [ ] `bunx tsc -b` & `bunx biome check src` & `bun test` & `bun run check:bundle` — green.
- [ ] Browser smoke (`preview_start vite`): Vault header → Export → downloads JSON; Import → pick that file → summary shows correct counts → Merge (collection unchanged since same data) / and an invalid file shows the inline error. 0 console errors.
- [ ] Review (`caveman:cavecrew-reviewer`): error surfacing (no silent failure), merge vs replace correctness, replace confirm, state reset on close, no regression to export.

## Self-review
- Import dialog (T1) + wiring (T2). Merge/replace + inline errors + summary. ✓
- Reuses foundation backup engine; export unchanged.
