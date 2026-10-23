# Konzult CRM — Project Rules

**Owner:** Zander Kotze
**Last updated:** 2026-10-23
**Status:** Phases 1, 2 and 3 live; Cal.com connected on production; the website form not yet connected
**Inherits from:** `~/.claude/CLAUDE.md` (global rules)

---

## 1. What this project is

Konzult's internal CRM and Zander's daily driver. It tracks every prospect and referral partner from first capture to client, records every touch and why journeys end, and runs client after-sales care. The full product spec is `docs/CRM-SPEC.md`; read it before building anything.

**Core modules:**
1. People, organisations and journeys (client track + partner track) with stage history and exit reasons
2. Touches, meetings, tasks and automations (Today screen, Pipeline board)
3. Imports (BNI weekly visitor sheets, outreach campaigns, CSV/Excel)
4. Insights (funnel, sources, outreach by channel, fall-out: our side vs their side)

---

## 2. Business context

- **End-user:** Zander only (team access designed in, not enabled)
- **Scale:** hundreds to low thousands of contacts
- **Regulatory posture:** POPIA. s69 consent for electronic marketing; s72 cross-border (Supabase EU region)
- **Go-live status:** not started
- **Revenue model:** internal tool. Also a live demo of Konzult's "Custom Data Management Systems" offer

---

## 3. Tech stack

| Layer | Technology | Version | Notes |
|---|---|---|---|
| Framework | Next.js (App Router) | 16.2.x | Match `AI CFO/konzult-cfo` |
| Language | TypeScript | 5, strict | |
| Database | Supabase Postgres | — | Dedicated projects, EU region |
| Auth | Supabase Auth | — | Two-factor required |
| Hosting | Vercel | Pro (existing seat) | GitHub `Konzult-Analytics/konzult-crm` |
| Styling | Tailwind | 4 | Konzult CI: `#FF3210`, `#1A1714`, `#F7F4EE` |
| Key libs | zod, SheetJS, papaparse, vitest, Anthropic SDK | — | Anthropic SDK from Phase 4 |

**Stack quirks to know about:**
- Next.js 16 differs from training data: read `node_modules/next/dist/docs/` before writing new patterns. Route protection lives in `src/proxy.ts` (formerly middleware).
- Use **pnpm**. The C: drive is nearly full: check free space before installs and builds, and keep Turbopack's dev filesystem cache off. Package versions match `AI CFO/konzult-cfo` so pnpm links them from the shared store instead of downloading.
- Run shell commands with absolute paths or `git -C`. A bare `cd` moves the session's working directory.

**Commands:** `pnpm dev` / `pnpm build` / `pnpm lint` / `pnpm typecheck` / `pnpm test`. Set-up runbook: `docs/SETUP.md`.

---

## 4. Environments

| Env | URL | Database | Purpose |
|---|---|---|---|
| Local | localhost:3000 | `konzult-crm-dev` (`wuythvorfkujurxjrnap`) | Building; fake seed data only |
| Preview | Vercel preview URLs | `konzult-crm-dev` (`wuythvorfkujurxjrnap`) | Branch review; fake data only |
| Production | https://konzult-crm.vercel.app | `konzult-crm-prod` (`jqrxpggfxqcmjbtignld`) | Real contacts |

Vercel: team `konzult-analytics-projects`, project `konzult-crm`, functions pinned to `dub1` by `vercel.json`. Env vars are scoped per environment (Production → prod, Preview → dev); the URL vars are Config type, and Zander enters the publishable-key values himself.

Both projects: org `jixzulbkfppjenmfpbne`, West EU (Ireland). Before any `supabase db push` or `config push`, check `supabase/.temp/project-ref` names the intended project. The CLI pushes to whichever project is linked. One-off data fixes on production (never schema changes) run with `supabase db query --linked -f <file>` while linked to prod, only with Zander's go-ahead and after a read-only preview; relink dev straight after. Preview `config push` with `echo n | supabase config push` first: the CLI's local defaults can silently weaken remote settings.

**Trap:** in `config.toml`, `[auth] enable_signup = false` is what blocks new sign-ups. `[auth.email] enable_signup` is the **email login provider switch**: setting it false disables email login entirely, and every login fails with `email_provider_disabled`. Keep it `true`. This happened on dev on 2026-10-22 and was fixed the same day.

**Env switching:** `.env.local` locally; Vercel environment variables per environment (Preview → dev, Production → prod).

Both projects live in the same Supabase organisation as the Vertical SaaS / CFO project (Zander's choice, 2026-10-22). The Supabase MCP connector in these sessions only reaches "Konzult-Analytics's Org" (the Lifestyle projects), so this project's migrations go through the Supabase CLI (`supabase link` + `supabase db push`), never MCP or dashboard SQL. Auth settings live in `supabase/config.toml` and go out with `supabase config push`.

**Never** use the shared `bfztbhnrxpdxxwymvayq` project (Vertical SaaS / CFO) for this app.

---

## 5. Architecture patterns

- **Auth:** email + password, then a compulsory authenticator-app code (Supabase TOTP MFA). Sign-ups are off; accounts are created in the Supabase dashboard. The first account becomes owner of the "Konzult" workspace (trigger in the first migration). `src/lib/auth/routing.ts` decides every redirect (unit-tested); `src/proxy.ts` applies it; pages behind login also call `requireMfaSession()`. All Supabase calls are server-side, and the CSP allows only this origin.
- **Login attempt limits** come from Supabase Auth, which every sign-in and code check passes through. Because calls come from the server, they share one IP bucket. For a single-user tool that's acceptable: a brute-force attempt also briefly locks out the owner. Revisit if the team grows.
- Every table has `workspace_id`; RLS scopes rows to workspace members. Every public table also gets the restrictive `"two-factor required"` policy (aal2); `tests/rls.test.ts` fails for any table without it.
- `journey_stage_history` is written by the `private.record_stage_change` trigger on every stage or status change. The app only reads it, and it is not insertable by the `authenticated` role.
- Closing a journey (lost / parked) requires an exit reason, and parking a revisit date. Check constraints on `journeys` enforce both.
- `workspace_id` defaults to `private.my_workspace_id()`, so the app never passes it. Composite foreign keys `(workspace_id, id)` keep every link inside one workspace.
- Logging a touch advances the journey by the spec's entry rules (`advanceFor` in `src/lib/crm/stages.ts`): first outreach → Contacted; a booked or held meeting → Meeting / One-to-one held. Moves are forward only.
- "Today" and every displayed date use South African time (`src/lib/crm/dates.ts`). Servers run in Dublin (UTC).
- Global CSS lives in Tailwind's `@layer base` (elements) and `@layer components` (`.btn`, `.card`, `.chip`…), so utility classes can override them. Never add unlayered element styles.
- Database types are generated: run `pnpm db:types` after a migration reaches dev.
- **Imports** (`/import`, `src/lib/import/`): the server parses an uploaded file (SheetJS) into `ParsedFile`, matches rows against existing people and businesses, and shows a preview. On commit, the server re-validates the preview with zod, re-matches against fresh data, builds a plan (`plan.ts`) and calls `public.import_contacts` once. That function runs as the caller (RLS and two-factor apply) in a single transaction: nothing is saved unless every row is. Matching uses email, then phone, then name + business, then a unique name. Existing contacts only gain blanks; they're never overwritten. Repeats in a file are merged with `same_as`. Identical touches aren't inserted twice, so re-importing a file adds nothing.
- **Marketing consent** (POPIA s69) is per person: `people.marketing_consent` is `unknown`, `granted` or `refused`, with a date and note. Imports never set it. Future bulk sends must only go to `granted`.
- **Automations** live in the database (migration `20261023090000`): when a client journey reaches Client, `private.client_care_tasks` adds a monthly check-in (30 days), a monthly payment check (7 days) and a testimonial + referral ask (60 days), all `origin = 'auto'`. Ticking off a `repeat_rule = 'monthly'` task makes `private.repeat_task` schedule the next one, until the journey closes. The 4-day follow-up pre-set, "No reply after 3 tries" and "Partners to reconnect with (90+ days)" are app-side (`LogForm.tsx`, `src/lib/crm/today.ts`).
- **Fit check:** four answers on `journeys` (`fit_need`, `fit_timing`, `fit_budget`, `fit_decision`: yes / maybe / no) give the generated `fit_score` (0–100; 60+ is a strong fit, `STRONG_FIT`). Insights compares fit with outcome.
- **Client care** (migration `20261023130000`): a won client journey has `client_status` (onboarding / active / at_risk / paused / ended), set to Onboarding by `private.client_status_set` and cleared if it leaves the Client stage. Ended cancels its open auto care tasks (task status `cancelled`; tasks are never deleted); leaving Ended restarts the monthly ones. `private.add_client_care_tasks` builds the care set for the won-client trigger, the comeback and the backfill. Testimonial and referral outcomes are columns on `journeys`.
- **Proposals** (`proposals` table): `private.proposal_moves_journey` moves the journey forward when one is sent (→ Proposal) or accepted (→ Client) and copies its value into `value_estimate`. Declining doesn't move anything; the app can also close the journey as lost with a reason. Proposals only attach to client journeys.
- **Documents** (`documents`, migration `20261023160000`): a stored file or a link. Client documents hang off a person, business or journey; library items (`is_library`, always marketing) hang off nothing. Files live in the private Storage bucket `documents` at `{workspace_id}/{document_id}/v{n}/{file}`; storage rules key off the first folder. Uploads go through server actions, capped at 4 MB because Vercel refuses bodies over ~4.5 MB (bigger material is a link). A new version uploads alongside the old file, so links already sent still open what was sent. Nothing is deleted: documents are archived. `/documents/{id}` opens one for Zander via a five-minute signed URL.
- **Tracked links** (`asset_sends`): one row per document per person, with a 32-character random token (the secret) and the target fixed at send time (a 12-month signed URL, or the item's own link). The public page `/d/{token}` (allowed before login in `routing.ts`) shows the title and a privacy line; only pressing Open counts (POST `/d/{token}/open`), so link previews and email scanners don't. `public.share_info` / `public.share_open` are security-definer functions open to `anon`, revealing only one link's title, state and target; `share_open` throttles each link to 30 opens an hour. Zander's own opens while logged in aren't counted. Links can be switched off.
- **Templates and POPIA s69** (`templates`, `src/lib/crm/messages.ts`, unit-tested): each template has a purpose. Marketing (and any message carrying library material) needs consent `granted` or a current client; personal messages are blocked only by a refusal; one consent request may go to someone whose consent is unknown. The server re-checks in `prepareSend`. Marketing messages get the opt-out line. Sending fills `{first_name}`, `{full_name}`, `{business}`, `{links}`, logs an outbound touch (`created_via = 'send'`, `template_id`), and opens Zander's own email app (mailto:) or WhatsApp (wa.me); the CRM sends nothing itself.
- **BNI referrals** (`referrals`, migration `20261023190000`): given (Zander passed a member a lead; the person may only be a name) or received (a member passed Zander a lead: the person is added if new and gets a client journey, source Referral, introduced by the member). `private.referral_follows_journey` moves a received referral along with its journey: in contact, business closed (with the deal value as `closed_value`), or didn't happen. `closed_value` on a given referral is the member's TYFCB, entered by hand.
- **Campaign manager** (`/campaigns`): campaigns (channel, start date, message, running or finished) with their numbers (`campaignNumbers` in `insights.ts`), and the BNI tab: the weekly one-to-one target (`workspace_settings`, default 5, can be switched off; a missing row means the defaults) and referrals. A touch or a send can be tagged with a running campaign.
- **Inbound doors** (migrations `20261023210000`, `20261023210100`; approved by Zander 2026-10-23): `/api/inbound/cal/{key}` (Cal.com webhook) and `/api/inbound/website/{key}` (Framer form webhook now; the new Vercel website later, signing the same way from its server). Each connection's 48-character key is created in Campaigns → Connections, shown once, and stored only as a SHA-256 fingerprint (`inbound_connections`). The route checks the sender's HMAC signature made with that key (`src/lib/inbound/signatures.ts`; Cal.com hex or base64 over the raw body, Framer `sha256=` over body + submission ID), caps bodies at 64 KB, and flattens the message (`src/lib/inbound/messages.ts`). Then `public.inbound_cal` / `public.inbound_website` (security definer, open to `anon`) check the key's fingerprint, throttle each connection to 60 events an hour, and do only their own job. A failed signature is recorded on the connection. No service-role key and no Vercel secrets are involved.
- **Bookings:** a person is matched by email, then by the last nine digits of their cell when one side has no email (different emails on one number are different people), or added (source Booking link). Slug `…one-to-one…` → partner journey to One-to-one; `…kickoff…` → note only; anything else → client journey to Meeting (a parked journey reopens). Each booking adds a timeline note and a prep task due the working day before; reschedules move both, cancellations cancel both. Notes and tasks use the event type's own name (Cal.com's `eventTitle`), not the booking title "… between Zander Kotze and …". Today lists meetings for the next 7 days.
- **Website enquiries** land in `inbound_leads` and on Today's "New enquiries" inbox (Zander's choice: no contact is created from spam). "Add to CRM" creates or matches the person (consent recorded if they ticked the box), a client journey (source Website), the enquiry as an inbound email touch and a reply task due today; "Not a lead" bins it.
- **Menu:** seven tabs. On phones they wrap onto two rows rather than scrolling, so none is hidden.
- **Insights** (`/insights`) are computed in TypeScript from journeys, stage history and touches (`src/lib/crm/insights.ts`, unit-tested), per track and period.
- **The API returns at most 1,000 rows per request** (`[api] max_rows`), silently. Any read that isn't naturally small (lists, matching, Insights) goes through `fetchAll` (`src/lib/supabase/fetch-all.ts`) with `.order(...).order("id").range(from, to)`.
- `vitest` runs test files one at a time (`fileParallelism: false`). Parallel in-memory Postgres instances exhausted memory on the dev machine.
- Server actions live next to their pages (`app/**/actions.ts`). All writes and AI calls are server-side.

---

## 6. Project-specific security rules

- **Sensitive tables:** `people`, `organisations`, `interactions`, `consents`, `documents`
- **Roles:** owner (all), member (later)
- **Public endpoints:** booking webhook, website-form webhook, BCC email inbound, document share links. Each must verify a signature or secret, be rate-limited, and validate input with zod
- **Share links (built in 2b):** the token is the secret and is format-checked before any database call; the throttle is per link (30 opens an hour) inside `share_open`. There is no per-IP limit in the app; volume attacks rely on Vercel's platform protection. Revisit if links are abused
- **Data retention:** per-person export and delete/anonymise (POPIA)

---

## 7. Project-specific anti-patterns

| Anti-pattern | Why banned here |
|---|---|
| Real contacts in the dev database | POPIA; dev is fake data only |
| Sending marketing templates to people without recorded consent | POPIA s69 |
| Health, religion or other special personal information in notes | POPIA s26 and s57 cross-border authorisation |
| Scraping BNI Connect | BNI terms; import from exported or hand-built sheets instead |

---

## 8. Cookbook

### Adding a table

1. New migration `supabase/migrations/YYYYMMDDHHMMSS_name.sql` with rollback steps in the header.
2. Include `workspace_id`, enable RLS, add the restrictive `"two-factor required"` policy and the membership policies (`private.is_workspace_member(workspace_id)`), and set grants explicitly (`revoke all … from anon`).
3. Extend `tests/rls.test.ts` with read and write probes for the new table; `pnpm test` must pass.
4. Apply to dev with `supabase db push` while linked to dev; prod only with Zander's go-ahead.
5. `pnpm db:types` to regenerate `src/lib/supabase/database.types.ts`.

### Dev sample data

`supabase/seed.sql`, `seed-phase1c.sql`, `seed-phase2a.sql`, `seed-phase2b.sql`, `seed-phase3a.sql` and `seed-phase3b.sql` hold fake people (`@example.test`). Load them with `supabase db push --include-seed` while linked to dev. They are idempotent. Three things stop them reaching production: `[remotes.production.db.seed] enabled = false`, a guard in each file that refuses any database without the dev-only `claude-test+dev@konzult.co.za` login, and the linked-project check. `tests/seed.test.ts` proves the guards.

**Trap:** the CLI runs each seed file once. Editing a file that already ran only updates its recorded hash ("Updating seed hash"); the new rows never arrive. Put new samples in a new file with the same guard, and list it in `[db.seed] sql_paths` in `config.toml`.

### Browser checks as the dev test login

`.env.local` holds `E2E_TEST_EMAIL`, `E2E_TEST_PASSWORD` and `E2E_TEST_TOTP_SECRET`. This login exists only in `konzult-crm-dev` and is a member of the Konzult workspace there (added by the seed). Log in at localhost and get the two-factor code from `node scripts/totp.mjs`. Never repeat these values in chat.

---

## 9. Current state and deferred items

- **2026-10-22:** spec v0.1 approved: stage names and exit reasons as drafted, two new Supabase projects.
- **2026-10-22:** Phase 0 code on `feature/phase0-setup`: login + compulsory two-factor, workspace migration, phone-install manifest and icons. Tests, typecheck, lint and build pass. Dev database set up (migration `20261022120000` applied; sign-ups off, 12-character minimum password, TOTP on). App runs locally against dev. Zander's dev login, two-factor enrolment and the set-up check (workspace read through RLS) all passed end to end. Pushed to GitHub `Konzult-Analytics/konzult-crm` (HTTPS via Git Credential Manager): `main` holds only an empty initial commit; Phase 0 sits on `feature/phase0-setup` and reaches `main` via pull request after the Vercel preview is checked. Vercel env vars set (Production → prod, Preview → dev). Prod database set up on 2026-10-22 with Zander's go-ahead: migration `20261022120000` applied; login rules from `config.toml` plus `[remotes.production]` (site URL `https://konzult-crm.vercel.app`). The CLI is linked back to dev. Preview deployment builds and loads (after pinning `"framework": "nextjs"` in `vercel.json`; the project was imported while `main` was empty, so Vercel had picked "Other"). PR into `main` opened; Zander merges. Then: Zander's real prod login, then phone install.
- **2026-10-22:** Phase 0 merged into `main` and live; Zander's prod login and phone install were confirmed.
- **2026-10-22:** Phase 1a (people, organisations, journeys, pipeline, touch logging, tasks, Today) merged as PR #2 and live; migrations `20261022140000` and `20261022140100` are on dev and prod.
- **2026-10-22:** Phase 1b (imports of BNI visitor sheets, outreach campaigns and contact lists; campaigns; marketing consent) merged as PR #3 and live; migration `20261022170000` is on dev and prod.
- **2026-10-23:** Phase 1c (automations, fit check, Insights, organisation-page stage controls, paging past the 1,000-row API limit) merged as PR #4 and live; migration `20261023090000` is on dev and prod.
- **2026-10-23:** Phase 2 decisions (Zander): client sub-statuses Onboarding / Active / At risk / Paused / Ended; templates open in Zander's own email app or WhatsApp (no sending service); tracked document links use `konzult-crm.vercel.app` for now (a `docs.konzult.co.za` address later); Phase 2 ships in two parts: 2a client care + proposals, 2b documents, library, tracked links and templates.
- **2026-10-23:** Phase 2a on `feature/phase2a-client-care`: client sub-status, care tasks for clients won before 1c (backfill, they start as Active), proposals that move the journey, testimonial and referral outcomes, deal value on board cards, Proposals on Insights. Merged as PR #5 and live; migrations `20261023130000` (schema) and `20261023130100` (backfill) are on dev and prod.
- **2026-10-23:** Phase 2b decisions (Zander): uploads up to 4 MB (bigger material as links; no CSP change); tracked links open a short Konzult page with an Open button and a privacy line; consent needed for marketing only (personal messages allowed unless refused, one consent request); links last 12 months.
- **2026-10-23:** Phase 2b on `feature/phase2b-documents`: client documents (person, business, journey; proposal files), the marketing library with versions and per-item sent/opened/clients numbers, tracked per-person links with the public page, templates (five defaults, editable on the Library page) and the Send panel with the POPIA s69 gate. Merged as PR #6 and live; migrations `20261023160000` and `20261023160100` are on dev and prod.
- **2026-10-23:** Phase 3 decisions (Zander): ship as 3a (BNI referrals, one-to-one target, campaign manager) then 3b (Cal.com booking auto-capture, website leads); weekly one-to-one target 5, changeable and switchable in the campaign manager; booking tool Cal.com (confirm free-plan webhooks at setup); the website is on Framer now but will move to Vercel, so 3b's lead endpoint must accept Framer's signed webhook and, later, a direct signed post from the new site. Business-card scan moves to Phase 4 (needs AI). 3b's public endpoints get their own security sign-off before building.
- **2026-10-23:** Phase 3a on `feature/phase3a-bni-campaigns`: BNI referrals given and received (temperature, status, TYFCB), received referrals creating and following client journeys, the weekly one-to-one target on Today and Insights, the campaign manager (campaigns with numbers, BNI tab), campaign tags on logged and sent touches. Merged as PR #7 and live; migration `20261023190000` is on dev and prod.
- **2026-10-23:** Phase 3b decisions (Zander): the inbound security design as built (per-connection keys stored as fingerprints, sender signatures, narrow door functions, 60 an hour, switch-off); website enquiries go to an inbox for one-tap review; booking prep tasks are due the working day before.
- **2026-10-23:** Phase 3b on `feature/phase3b-inbound`: the Cal.com and website doors, Connections tab, Today's meetings and enquiry inbox. Signed test calls on localhost covered every path (booked, duplicate, bad signature, reschedule, cancel, unknown key, oversized body, enquiry, spam trap, switched-off key). Migrations `20261023210000` and `20261023210100` are on dev and prod (prod applied 2026-10-23 with Zander's go-ahead; the CLI is linked back to dev; no production connection exists until Zander creates one); `seed-phase3b.sql` loaded on dev only. Merged as PR #8 and live.
- **2026-10-23:** Cal.com connected on production (the free plan has webhooks). Event types under `cal.com/konzult-analytics/`: `bni-one-to-one` (30 min), `discovery-call` (45 min), `next-stage-kickoff` (60 min), each asking "Cell number" (identifier `attendeePhoneNumber`, required) and "Business name" (`business`, optional). The webhook (version 2021-10-20) sends Booking created, rescheduled and cancelled to the production Cal.com connection. The Ping test passed the signature check, and a test booking and its cancellation reached Today end to end; the test contact was then removed from production with Zander's go-ahead (preview first). The website form (Framer) is not connected yet.
- **Known gap:** touches can only be logged for people, not for a business on its own.
- **Deferred:** inbox sync, WhatsApp Business API, Google Workspace move (Phase 5). Settings screens for editing sources and exit reasons (tables exist; seeded defaults for now).

---

## 10. Collaborators

- **Zander Kotze:** owner; product decisions
- **Konzult CFO / Vertical SaaS projects:** sibling apps; reuse patterns, not code or databases

---

## 11. Glossary

See `docs/CRM-SPEC.md` §16.

---

## 12. Standing authorisations

None granted yet. Ask Zander before acting.

---

## 13. Changelog

- **2026-10-22:** initial document
- **2026-10-23:** Phase 1c patterns (automations, fit check, Insights, `fetchAll`), seed-file trap, status brought up to date
- **2026-10-23:** Phase 2a patterns (client care, proposals) and the Phase 2 decisions
- **2026-10-23:** Phase 2b patterns (documents, storage, tracked links, templates and the s69 gate)
- **2026-10-23:** Phase 3a patterns (referrals, campaign manager, settings) and the Phase 3 decisions
- **2026-10-23:** Phase 3b patterns (inbound doors, bookings, enquiry inbox)
- **2026-10-23:** Cal.com connected on production; one-off production data fixes; short event names in booking notes and tasks
