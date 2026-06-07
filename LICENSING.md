# Licensing & Our Deal

**Current license:** [MIT](LICENSE). A relicense of the core to **AGPL-3.0** is
planned (see [Relicense status](#relicense-status)); until it lands and is
reviewed, MIT applies.

## Our deal with you

> The Cardstack client, your collection data, import/export, and the self-hosted
> path are open source — and always will be. We make money (if ever) by
> *operating* an optional hosted sync service, never by removing features from
> the open core or relicensing it out from under you. If a hosted service ever
> shuts down, your data and a fully working app remain yours, exportable, and
> self-hostable.

This promise is the point. It's made up front, before anyone is locked in — the
opposite of relicensing a popular project out from under its users.

## The model: open-core, hosted convenience

- **Open core** — everything you can run today: the client, the ~20k-card corpus,
  the IndexedDB store (and any future sync adapter), CSV/JSON import-export, and
  every collection/Binder feature. **Free and self-hostable forever.** Planned
  license: **AGPL-3.0** — keeps it genuinely open and self-host-friendly while
  deterring closed corporate forks.
- **Commercial layer** *(not built yet)* — a separate, **private** package
  providing *multi-tenant hosted operations*: billing, tenant management, and the
  managed sync service we would run. The line:
  **single-tenant self-host = open · multi-tenant SaaS operations = private.**
  The paywall is *operating the service*, not the code — which is why the core
  can stay fully open.
- **No ads**, ever, in the core.

## Relicense status

The repository is currently **MIT**. Relicensing the core to **AGPL-3.0** is
planned but **not yet applied** — it's pending a short legal review. Existing
MIT-licensed commits remain MIT; the relicense, when it lands, binds future
versions. The license file is the source of truth — if [LICENSE](LICENSE) still
says MIT, MIT is in effect.

---

*Not legal advice. Questions about licensing or commercial use: open an issue.*
