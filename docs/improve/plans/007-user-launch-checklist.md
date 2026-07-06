# Plan 007: Human owner's launch checklist — accounts, tokens, dashboards, legal

> **This plan is for the human owner (Rin), not an executor model.** Every item
> here needs a real account, a credit card, a legal judgment call, or dashboard
> access that an agent doesn't have. Items are ordered; each says what it
> unblocks. Claude's code-side counterpart is
> `006-claude-launch-readiness.md` — tasks there reference sections here as
> "007 §X.n".
>
> Rule for every credential below: store it in your password manager, put it
> ONLY where the item says (GitHub secret / `/etc/tcg/env` / Supabase
> dashboard), and never commit a value to either repo.

- **Planned at**: main `5cd3d09`, plugin `80b2437`, 2026-07-06
- **Status**: TODO (tick boxes as you go)

## The launch dependency chain, in one picture

```
A. Business decisions ──┐
B. Supabase production ─┼─→ D. Server env + CI secrets ─→ F. Smoke test → flip switch → LIVE
C. Stripe setup ────────┘                                  ↑
E. Pricing pipeline (independent track)          006 Tasks 1–10 (Claude)
G. Ongoing ops (after launch)
```

---

## §A — Business & legal decisions (blocks C and the public pages)

- [ ] **A.1 Name + domain.** Decide launch name (working name "Cardstack"; rename is parked — you CAN launch under it, but the domain, Stripe statement descriptor, and legal pages all bake it in, so decide consciously). Buy the domain, point DNS at the home server, provision TLS (certbot on the box, or Cloudflare proxy like the worker setup). Output: the canonical origin — becomes `APP_ORIGIN` (§D.2) and the Supabase site URL (§B.4).
- [ ] **A.2 Business entity + Stripe activation reality-check.** Stripe live mode requires an activated account: legal name (sole proprietor is fine), address, bank account, tax ID where applicable. Start this early — activation review can take days.
- [ ] **A.3 Terms of Service + Privacy Policy content.** Claude scaffolds the `/terms` and `/privacy` routes with placeholder-marked template text on request (not in 006 — content is yours to approve). You must review/edit: what you collect (email, vault data, Stripe billing via Stripe), retention, deletion (006 Task 7 makes it real), refunds, governing law. For an EU-audience paid service, a one-hour lawyer review is cheap insurance — your call.
- [ ] **A.4 Tax stance.** Decide: enable **Stripe Tax** (automatic calculation/collection; per-transaction fee) or start US-only/no-VAT and revisit. If you expect EU customers, Stripe Tax + registering where thresholds require is the defensible path. Talk to an accountant if unsure — this is the one item with real personal liability.
- [ ] **A.5 Refund policy.** One sentence you can honor (e.g. "full refund within 14 days, email support"). Feeds A.3 and the support macros. Also decide: account deletion (006 Task 7) cancels subs **immediately without refund** by default — confirm or change that behavior.
- [ ] **A.6 Support channel.** Create `support@<domain>` (or alias to your inbox). Feeds A.3, C.6, and the in-app about dialog. Discord server is optional and separately unblocks the rebrand Phase-2 community UI.

## §B — Supabase production project

- [ ] **B.1 Create the hosted project** (supabase.com; paid plan recommended for daily backups + no auto-pausing). Region close to you/users. Record: project URL, anon key, service-role key → password manager.
- [ ] **B.2 Wait for 006 Task 5** (hardening migration) to merge before first push.
- [ ] **B.3 Apply migrations**: `supabase link --project-ref <ref>` then `supabase db push` from the repo root. Verify in SQL editor: `select count(*) from pg_policies;` returns a healthy number and `select billing_enabled from billing_config;` → `false` (stays false until §F.2).
- [ ] **B.4 Auth configuration** (Dashboard → Auth → URL Configuration): Site URL = `https://<domain>`; Redirect URLs allowlist = `https://<domain>/auth/callback`. Without this, magic links land on localhost.
- [ ] **B.5 Production SMTP** (Dashboard → Auth → SMTP): built-in Supabase email is rate-limited to ~2/hour — useless in prod. Sign up for Resend / Postmark / SES, verify your sending domain (SPF + DKIM DNS records), plug SMTP creds into Supabase, raise the email rate limit sensibly (e.g. 30/hour), send yourself a magic link end-to-end. Optional: brand the email template.
- [ ] **B.6 Backups**: confirm daily backups are on (paid plan) and note where point-in-time sits. The restore *drill* is §G.3.

## §C — Stripe configuration (test mode first, then live)

Do everything in **test mode** first; §F.1 smoke-tests it; repeat in live mode after.

- [ ] **C.1 Product + prices**: Product "Cardstack Plus" (or per A.1) with two recurring prices: $4/month, $36/year. Record both `price_…` ids → `STRIPE_PRICE_PLUS_MONTHLY`, `STRIPE_PRICE_PLUS_ANNUAL`.
- [ ] **C.2 Webhook endpoint**: Developers → Webhooks → Add endpoint `https://<domain>/api/stripe/webhook`, subscribed to exactly these 7 events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`, `charge.dispute.created`, `charge.refunded` (8 listed — the plugin handles these; the design doc's canonical list). Record the signing secret `whsec_…` → `STRIPE_WEBHOOK_SECRET`.
- [ ] **C.3 Customer Portal** (Settings → Billing → Customer portal): enable; allow cancel + switch between the two prices; set business info + support email (A.6).
- [ ] **C.4 Branding + receipts**: Settings → Branding (name, icon, color — violet 😉); Settings → Emails: enable receipt emails for successful payments. Statement descriptor = recognizable name (A.1) — this is what appears on card statements and prevents "what is this charge?" disputes.
- [ ] **C.5 Stripe Tax** per A.4 decision (Settings → Tax). If enabled, tell Claude — checkout needs `automatic_tax` enabled (small 006 follow-up).
- [ ] **C.6 Restricted API key**: create a **restricted** secret key (charges, customers, subscriptions, checkout, billing portal — write; everything else none) instead of the full secret key → `STRIPE_SECRET_KEY`. Cheap blast-radius reduction.
- [ ] **C.7 Live-mode repeat**: after §F.1 passes in test mode, repeat C.1–C.6 in live mode (fresh price ids, webhook secret, restricted key).

## §D — Server env + CI secrets (blocks the deploy shipping billing)

- [ ] **D.1 GitHub deploy key for the plugin**: first push `card-stack-cloud` to a **private** GitHub repo (it has no remote today), then generate an SSH keypair; add the public half as a read-only deploy key on that repo; add the private half as Actions secret `CLOUD_DEPLOY_KEY` on the **public** repo. Replace the `<OWNER>/card-stack-cloud` placeholder in `.github/workflows/deploy.yml` with the real owner/name. Set repo variable `DEPLOY_BILLING=1` when ready to ship billing (006 Task 1 gates on it).
- [ ] **D.2 `/etc/tcg/env` on the home server** — add (names only listed here; 006 Task 8's DEPLOY.md table is the authoritative inventory): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (B.1), `STRIPE_SECRET_KEY` (C.6), `STRIPE_WEBHOOK_SECRET` (C.2), `STRIPE_PRICE_PLUS_MONTHLY`, `STRIPE_PRICE_PLUS_ANNUAL` (C.1), `APP_ORIGIN` (A.1). Then `sudo systemctl restart tcg`.
- [ ] **D.3 Client build vars** (repo → Settings → Actions → Variables): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (B.1 — anon key is public by design) so the deployed client gets the cloud vault UI. Note: today deploy.yml only wires `VITE_API_BASE`; Claude adds these two alongside it in 006 Task 1's deploy.yml edit.
- [ ] **D.4 GitHub "production" environment**: confirm the environment exists with the main-only deployment-branch rule (deploy.yml:33-38 comment documents the clicks).
- [ ] **D.5 Merge the plugin branch**: `feat/stripe-billing-plugin` → the plugin repo's main (after 006 Task 3 lands on it), so the deploy checkout ref is stable.

## §E — Pricing pipeline go-live (independent track)

- [ ] **E.1 Cloudflare R2 bucket + API token** for the price blobs (mirror the corpus setup — the corpus CI gotcha applies: token needs **Workers R2:Edit**, not S3 keys). Add as Actions secrets per `build-prices.yml`'s expectations.
- [ ] **E.2 Trigger `build-prices.yml`** manually once; confirm green; `curl <worker>/prices` → 200.
- [ ] **E.3 Cardmarket written permission**: send the still-owed email requesting written permission for price display with attribution (their ToS ask). Keep the reply on file. The attribution UI already ships.
- [ ] **E.4 tcgcsv licensing acknowledgment**: no published license; community-precedent use only. Accept the risk consciously or drop the source — one-line decision, record it in the pricing spec.

## §F — Launch sequence

- [ ] **F.1 Test-mode E2E smoke** (uses 006 Task 10's kit, local stack + Stripe test keys): full checkout with card `4242…` → entitlement row appears → vault write syncs → cancel via portal → row flips → `charge.refunded` trigger sanity. Every step green before proceeding.
- [ ] **F.2 Production smoke + flip**: deploy with `DEPLOY_BILLING=1`; `curl https://<domain>/api/health` → `plugin:"present"`; then flip the gate: `update public.billing_config set billing_enabled = true;` (SQL editor, service role). From this moment free users can no longer create *new* cloud rows without Plus (existing rows stay editable — by design).
- [ ] **F.3 One real live transaction**: subscribe yourself with a real card, verify entitlement + sync, then refund it from the Stripe dashboard and verify the downgrade lands (webhook → `unpaid`). This exercises the live webhook end-to-end.
- [ ] **F.4 Watch week-one signals daily**: Stripe Dashboard → Webhooks delivery log (failures = the #1 silent killer); `journalctl -u tcg | grep -i stripe`; Supabase Auth logs for email bounces.

## §G — Ongoing ops (set up once, after launch)

- [ ] **G.1 Uptime monitoring**: point UptimeRobot / healthchecks.io (free) at `https://<domain>/api/health`; alert to your email/phone. Honest note from the audit: a home server hosting a paid service is a single point of failure — power, ISP, hardware. The mitigation that matters is *detection* (this item) + the DB being hosted (Supabase holds the customer data; an app outage is annoying, not destructive).
- [ ] **G.2 Stripe webhook failure alerts**: Stripe emails you when an endpoint fails repeatedly — confirm the notification email on the account is one you read.
- [ ] **G.3 Backup restore drill**: once, restore a Supabase backup to a scratch project and confirm the vault tables come back. A backup you've never restored is a hope, not a backup.
- [ ] **G.4 Secret hygiene**: all of §B/§C/§D's credentials live in the password manager; calendar a quarterly 15-minute rotation pass (runbook steps in DEPLOY.md after 006 Task 8).
- [ ] **G.5 Support inbox routing**: make sure `support@<domain>` actually reaches you (test-send); write yourself 3 canned replies: refund, "sync not working" (→ runbook), account deletion request.

## Optional quality-of-life

- [ ] Authorize the Stripe MCP connector in Claude settings — lets future Claude sessions read/act on your Stripe account directly (products, webhooks) instead of you clicking dashboards.
- [ ] Status page (instatus/atlassian free tier) — nice-to-have, not a launch gate.
