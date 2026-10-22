# Konzult CRM — Project Rules

**Owner:** Zander Kotze
**Last updated:** 2026-10-22
**Status:** Phase 0 (set-up) in progress on `feature/phase0-setup`
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
| Production | TBD | `konzult-crm-prod` (`jqrxpggfxqcmjbtignld`) | Real contacts |

Both projects: org `jixzulbkfppjenmfpbne`, West EU (Ireland). Before any `supabase db push` or `config push`, check `supabase/.temp/project-ref` names the intended project. The CLI pushes to whichever project is linked. Preview `config push` with `echo n | supabase config push` first: the CLI's local defaults can silently weaken remote settings.

**Env switching:** `.env.local` locally; Vercel environment variables per environment (Preview → dev, Production → prod).

Both projects live in the same Supabase organisation as the Vertical SaaS / CFO project (Zander's choice, 2026-10-22). The Supabase MCP connector in these sessions only reaches "Konzult-Analytics's Org" (the Lifestyle projects), so this project's migrations go through the Supabase CLI (`supabase link` + `supabase db push`), never MCP or dashboard SQL. Auth settings live in `supabase/config.toml` and go out with `supabase config push`.

**Never** use the shared `bfztbhnrxpdxxwymvayq` project (Vertical SaaS / CFO) for this app.

---

## 5. Architecture patterns

- **Auth:** email + password, then a compulsory authenticator-app code (Supabase TOTP MFA). Sign-ups are off; accounts are created in the Supabase dashboard. The first account becomes owner of the "Konzult" workspace (trigger in the first migration). `src/lib/auth/routing.ts` decides every redirect (unit-tested); `src/proxy.ts` applies it; pages behind login also call `requireMfaSession()`. All Supabase calls are server-side, and the CSP allows only this origin.
- **Login attempt limits** come from Supabase Auth, which every sign-in and code check passes through. Because calls come from the server, they share one IP bucket. For a single-user tool that's acceptable: a brute-force attempt also briefly locks out the owner. Revisit if the team grows.
- Every table has `workspace_id`; RLS scopes rows to workspace members. Every public table also gets the restrictive `"two-factor required"` policy (aal2); `tests/rls.test.ts` fails for any table without it.
- Stage changes go through one server action that also writes `journey_stage_history`. Never update `journeys.stage` directly.
- Closing a journey (lost / parked) requires an exit reason. Enforce this in the database, not only in the UI.
- Server actions live next to their pages (`app/**/actions.ts`). All writes and AI calls are server-side.

---

## 6. Project-specific security rules

- **Sensitive tables:** `people`, `organisations`, `interactions`, `consents`, `documents`
- **Roles:** owner (all), member (later)
- **Public endpoints:** booking webhook, website-form webhook, BCC email inbound, document share links. Each must verify a signature or secret, be rate-limited, and validate input with zod
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

---

## 9. Current state and deferred items

- **2026-10-22:** spec v0.1 approved: stage names and exit reasons as drafted, two new Supabase projects.
- **2026-10-22:** Phase 0 code committed on `feature/phase0-setup` (local only, no remote yet): login + compulsory two-factor, workspace migration, phone-install manifest and icons. Tests, typecheck, lint and build pass. Dev database set up (migration `20261022120000` applied; sign-ups off, 12-character minimum password, TOTP on). App runs locally against dev; login screen and wrong-password path verified. Next: Zander creates the dev login (`docs/SETUP.md` step 4), then GitHub/Vercel and prod (steps 6–8).
- **Deferred:** inbox sync, WhatsApp Business API, Google Workspace move (Phase 5).

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
