# Konzult CRM — Build Spec

**Owner:** Zander Kotze
**Version:** 0.1 (draft for review)
**Date:** 2026-10-22
**Based on:** Zander's requirements note (2026-10-22), Konzult business files, BNI material, and CRM market research.

---

## 1. Purpose

Konzult CRM is the one application Zander opens every day. It does two jobs first:

1. **Track how well outreach works.** Every prospect, every touch, and every point where someone drops out is recorded, so we can see what converts and why.
2. **Manage client relationships so nothing falls through the cracks.** Follow-ups, check-ins, birthdays and payment checks surface on their own.

Everything else is added on top: booking links, the marketing library, communication summaries and deeper insights.

**An analogy.** Each person or business has one *file* in the cabinet. A *journey* is the case we open when we try to win them. Every *touch* (email, WhatsApp, call, meeting) is a page in that file. The CRM shows which cases are moving, which have stalled, and which closed and why.

---

## 2. Design principles

| Principle | What it means in practice |
|---|---|
| **Capture once, in under 30 seconds** | Logging a touch from your phone must be faster than not logging it. If capture is slow, the data dies |
| **Every "no" point is a stage boundary** | Your own rule. A new stage starts wherever someone can end the conversation, so we know exactly where they dropped out |
| **Nothing closes without a reason** | Losing or parking a journey requires a reason. Without reasons there are no insights |
| **Selling vs referral is explicit** | Every meeting is tagged as a sales, referral or client-care meeting |
| **The system nags, you don't remember** | Follow-ups, check-ins and reminders are generated automatically |
| **POPIA by default** | Consent, opt-outs and source are recorded per person from day one |
| **Built for a team, used by one** | Starts as Zander-only. The data model allows Yannick, Malcom or Karlien to be added later without rework |

---

## 3. The funnel

### 3.1 Client track (selling Konzult's services)

Proposed names are on the left; Zander's working names are in brackets. Labels can be changed in Settings.

| # | Stage | Enters when | Can end here because… | Leaves for the next stage when |
|---|---|---|---|---|
| 1 | **Prospect** | Captured as worth contacting (manual, BNI Connect search, website form, referral, event) | — (not yet contacted) | The first outreach is sent |
| 2 | **Contacted** | First email / WhatsApp / call / BNI Connect message sent | No reply, or not interested | A meeting is booked |
| 3 | **Meeting** *(Prospect+)* | Meeting booked or held | Not in the market, not a fit | A tailored proposal is sent |
| 4 | **Proposal** *(Pre-client)* | Proposal sent ("yes or no" decision) | Declined, or went quiet | The proposal is accepted |
| 5 | **Client** | Said yes | Ends the engagement | — (moves into client care) |

**Client sub-status:** Onboarding → Active → Paused → Ended. All after-sales care (check-ins, birthdays, payment checks, asking for referrals) lives here.

**Why "Contacted" is its own stage.** Your note has outreach happening while someone is still a Prospect. But a person can say no, or simply not reply, at that point, so under your own rule it is a separate stage. It is also the stage that answers "is our outreach working?"

### 3.2 Partner track (referral relationships)

This covers BNI members, accountants and anyone whose value is *referrals* rather than buying. It matches the distinction in your note between "referral opportunities" and "real selling opportunities".

| # | Stage | Enters when |
|---|---|---|
| 1 | **Prospect partner** | Identified (e.g. the BNI accountant search) |
| 2 | **Contacted** | First message sent |
| 3 | **One-to-one held** | First referral meeting has taken place |
| 4 | **Active partner** | At least one referral exchanged, or an agreed referral arrangement |
| — | **Dormant** | No contact for 90 days (set automatically; prompts a reconnect) |

One person can be on both tracks at once. Example: a BNI member who refers clients to you and might also become a client. Their file shows both journeys.

### 3.3 Exits: Lost and Parked

Any open journey can end in one of two ways:

- **Lost.** The stage it ended at is recorded automatically. You pick a reason.
- **Parked.** "Not now." You pick a revisit date, and a task appears on that date. This separates "never in the market" from "not yet".

Exit reasons are split into two groups. This is what answers *"did we do something wrong, or were they never in the market?"*:

| Their side (not in the market) | Our side (we could have done better) |
|---|---|
| No real need | Follow-up too slow or missed |
| No budget / too small | Proposal didn't match their need |
| Bad timing | Value wasn't clear (pitch) |
| Doing it in-house | Wrong or missing material |
| Chose another provider | No clear next step was agreed |
| Never responded | Price objection *(tagged ours — we didn't make the value clear enough for the price)* |

Both lists are editable in Settings.

### 3.4 Fit check ("possibility of success")

Right after the first sales meeting, four quick taps:

| Question | Answers |
|---|---|
| Do they have a problem we solve? | Clearly / Maybe / No |
| Will they act in the next 3 months? | Yes / Maybe / No |
| Does their size or budget fit? | Yes / Unsure / No |
| Were we speaking to the decision-maker? | Yes / Shared / No |

These four answers give a **fit score (0–100)**. Your own gut estimate is kept separately as a **chance-to-win %**.

**How the two combine:**
- **High fit + lost** → look at what *we* did (speed, proposal, material).
- **Low fit + lost** → they were never really in the market. Look at *targeting and sources* instead.

---

## 4. Core concepts

| Concept | What it is |
|---|---|
| **Person** | An individual: name, phone, WhatsApp, email, birthday, role, BNI chapter, GAINS notes |
| **Organisation** | A business: name, industry, size band, turnover band, city, website. A person can belong to one |
| **Journey** | One attempt to win a person or organisation on the client or partner track. Holds stage, source, referred-by, value, fit, exit |
| **Touch** (interaction) | Any communication: email, WhatsApp, call, BNI Connect message, meeting or note. Records direction (sent/received), outcome and summary |
| **Meeting** | A touch with extra detail: purpose (sales / referral / client care), setting (BNI one-to-one / external / online), attendees, notes, fit check, next step |
| **Task** | A reminder with a due date. Created manually or automatically. Can repeat |
| **Source** | Where a journey came from: BNI visitor, BNI one-to-one, BNI Connect search, referral, website, event, cold outreach, own network, booking link |
| **Referred by** | A link to the person who introduced them. This is how "who introduced whom" and the return per BNI member are tracked |
| **Campaign** | An outreach batch, e.g. "Accountant partner outreach – Oct 2026", with its message and results |
| **Document** | A file attached to a client (proposal, contract, report) or held in the shared marketing library |
| **Consent** | Per person and channel: granted / requested / refused / withdrawn, with date and evidence |

---

## 5. Data model

Postgres in a new, dedicated Supabase project. Every table carries `workspace_id`, so a team can be added later. Row-level security (the database itself enforces who can see which rows) is on every table.

| Table | Key fields |
|---|---|
| `workspaces`, `workspace_members` | user_id, role (owner / member) |
| `organisations` | name, industry, size_band, turnover_band, city, website, notes |
| `people` | first/last name, email, phone, whatsapp, organisation_id, role_title, birthday, bni_chapter, is_bni_member, gains (json), notes |
| `sources` | label, group (BNI / referral / inbound / outbound / event) |
| `journeys` | track (client / partner), person_id, organisation_id, stage, status (open / won / lost / parked), source_id, referred_by_person_id, campaign_id, value_estimate (R), chance_pct, fit answers + fit_score, parked_until, exit_stage, exit_reason_id, exit_side (ours / theirs), exit_note, opened_at, closed_at |
| `journey_stage_history` | journey_id, from_stage, to_stage, changed_at. Feeds time-in-stage and funnel maths |
| `exit_reasons` | label, side (ours / theirs), active |
| `interactions` | type (email / whatsapp / call / bni_message / meeting / note), direction (out / in), occurred_at, summary, outcome (no_reply / replied / interested / not_interested / meeting_booked …), journey_id, organisation_id, campaign_id, meeting_purpose, meeting_setting, next_step, created_via (manual / import / booking / email_bcc / whatsapp_export / voice) |
| `interaction_people` | interaction_id, person_id (attendees / recipients) |
| `tasks` | title, kind (follow_up / check_in / birthday / payment / referral_ask / revisit / other), due_at, repeat_rule, status, person_id, journey_id, origin (auto / manual) |
| `campaigns` | name, track, channel, message_template, started_at, notes |
| `proposals` *(Phase 2)* | journey_id, title, value (R), sent_at, status, decided_at, document_id |
| `documents` *(Phase 2)* | kind (proposal / contract / report / marketing / other), title, storage_path, version, tags, is_library, person_id / organisation_id / journey_id |
| `asset_sends` *(Phase 2)* | document_id, person_id, sent_at, channel, share_token, first_opened_at, open_count |
| `consents` | person_id, channel, status, basis, recorded_at, evidence |
| `referrals` *(Phase 3)* | direction (given / received), from_person_id, to_person_id, about_person_id, date, temperature, status, closed_value (R) |

Audit columns (created_at/by, updated_at/by) go on every table.

---

## 6. Screens (Phase 1)

| Screen | What it shows / does |
|---|---|
| **Today** (home) | Overdue and due follow-ups. Today's meetings. Journeys going cold (no touch in 14 days). Birthdays this week. Parked journeys due for a revisit |
| **Pipeline** | A board per track (client / partner), with columns = stages. Each card shows the name, value, days in stage and next task. Drag to move. Dropping on Lost or Parked asks for the reason |
| **People & Organisations** | Searchable lists with filters (stage, source, chapter, tag). Each profile has a timeline of all touches, journeys, tasks, documents and consent |
| **Log a touch** (quick add, mobile-first) | Who → channel → sent/received → outcome → one-line note → next follow-up date. Under 30 seconds |
| **Meeting capture** | Purpose (sales / referral / client care), setting, attendees and notes. Then the fit check (sales) or referral asks (referral), and the next step |
| **Import** | BNI weekly visitor sheet, accountant outreach sheet (becomes a campaign), potential client list, and any CSV/Excel with column mapping. Duplicates are detected before saving |
| **Insights** | Funnel, sources, outreach by channel, fall-out map (see §8) |
| **Settings** | Stage labels, exit reasons, sources, follow-up timing, check-in cadence |

The app installs on your phone's home screen as a web app (a PWA, so no app store is needed).

---

## 7. Automations (Phase 1)

| When… | …the CRM does |
|---|---|
| An outbound touch is logged with no reply yet | Creates a follow-up task in 4 days (adjustable) |
| 3 outbound touches in a row get no reply | Prompts: park or close as "Never responded" |
| An open journey has no touch for 14 days | Shows it under "Going cold" on Today |
| A journey moves stage | Writes a history row (feeds speed and conversion stats) |
| A journey becomes Client | Creates the client-care set: monthly check-in (repeating), birthday reminder, monthly payment check, and a "ask for a testimonial + referral" task at 60 days |
| A journey is parked | Creates a revisit task on the chosen date |
| A partner has no contact for 90 days | Marks them Dormant and creates a reconnect task |

---

## 8. Insights — the questions it must answer

| Question | Measure |
|---|---|
| Is our outreach working? | Reply rate and meeting rate by channel (email, WhatsApp, call, BNI Connect message), by campaign and by message |
| Where do good clients come from? | Journeys, meetings, proposals, clients and Rand won, by source and by referrer (per BNI member) |
| Where do we lose people? | Fall-out count at each stage, split into our side vs their side |
| Did we drop the ball, or were they never in the market? | Fit score vs outcome. Follow-up speed and overdue tasks at the moment of loss |
| How fast do we move? | Days to first contact; days in each stage |
| Does size matter? | Win rate by organisation size and turnover band, and by proposal value |
| Which material helps? | Assets sent to won vs lost journeys; opens *(Phase 2)* |
| Are we doing the BNI work? | One-to-ones per week vs the mentor-pack target; referrals given and received *(Phase 3)* |
| What does our ideal client look like? | A won-vs-lost profile across industry, size, source, fit and touches *(Phase 5)* |

---

## 9. Communications capture

Captured in stages, from simplest to most automated:

| Channel | Phase 1 | Phase 4 |
|---|---|---|
| **Email** | Quick log | A BCC/forward address (e.g. `log@in.konzult.co.za`). Copy it on any email and it lands on the right person's timeline with an AI summary. This works with your current tele.co.za mailbox: only a sub-domain is pointed at the logging service |
| **WhatsApp** | One-click send: the CRM opens WhatsApp with the message pre-written (`wa.me` link) and logs the touch | Export a chat (WhatsApp → Export chat), drop it into the CRM, and AI summarises it onto the person's file. On Android, "Share to Konzult CRM" works directly |
| **Calls** | Quick log | Record a voice note after the call: it's transcribed, summarised, and next steps become tasks |
| **Meetings** | Meeting capture form | Voice memo or note-taker (Fathom / Granola) imported. AI writes a pre-meeting brief before each meeting |

**AI summaries.** Each file keeps a running "relationship summary" that updates after every touch. Later, the won-vs-lost patterns build the ideal-client model.

**Not in the plan for now:** reading your full inbox, and the official WhatsApp Business API. Both are costly or restrictive. We revisit them if the simple routes prove too manual.

---

## 10. Booking links

- **Cal.com** (free plan) with three meeting types:
  - BNI one-to-one (30 min)
  - Discovery call (45 min)
  - Next Stage kickoff (60 min)
- Send the link from a person's file (email or WhatsApp) or put it on the website.
- When someone books, the CRM:
  - finds or creates the person (source: booking link)
  - logs the meeting
  - moves the journey to Meeting
  - creates a prep task
- The booking form carries a POPIA notice.
- **To verify before building:** whether Cal.com's free plan includes webhooks (the automatic "someone booked" notification to the CRM). Fallback: a simple booking page built on Google Calendar.

---

## 11. Marketing library and client documents (Phase 2)

- **Library:** business profile, one-pager, The Map, case studies, FFE videos, podcast. Each item is versioned and tagged by service and audience.
- **Send from the CRM:** each recipient gets their own link. The CRM records that it was sent, and shows when it was opened.
- **Client documents:** proposals, contracts and reports attached to the client's file.
- **Proposals:** value (R), sent date, status (sent / accepted / declined). These feed pipeline value and win-rate stats. The default value is the R7,500 first phase.
- **Templates:** post one-to-one thank-you, visitor follow-up, proposal cover note, and check-in. Merge fields fill in the details.

---

## 12. POPIA built in

| Requirement | How the CRM handles it |
|---|---|
| Electronic marketing needs prior consent (s69) | A consent record per person and channel. Cold contacts get one consent-request message only. Template sends are blocked until consent is recorded or they are a client |
| Opt-out in every marketing message | Templates include the opt-out line. An "Object" button suppresses the person everywhere |
| Tell people at collection (s18) | Privacy notice link on the booking page, the website form and email footers |
| Access / correction / deletion requests | Per-person export and delete/anonymise |
| Security (s19) | Two-factor login, row-level security, audit columns |
| Cross-border transfer (s72) | Supabase EU region. Data processing agreements with Supabase, Vercel, Cal.com and the AI vendor |
| Special personal information | Notes must not hold health, religion and similar details. The app warns |
| BNI referrals | Record that the referred person agreed to be contacted |

**Worth checking:** the accountant email campaign (October 2026) should be reviewed against s69. Once it's imported, the CRM will show which of those contacts have actually replied or consented. This is not legal advice; a privacy practitioner should confirm the s69 position.

---

## 13. Build phases

| Phase | What you get | Done when |
|---|---|---|
| **0. Set-up** | Repo, two Supabase projects (dev with fake data, prod with real data), Vercel, login with two-factor | You can log in on laptop and phone |
| **1. Core: outreach + nothing falls through** | People, organisations, journeys (both tracks), stages, exits with reasons, fit check, touches, meetings, tasks + automations (§7), Today, Pipeline, Import (BNI visitor sheets, accountant campaign, client list), first Insights (funnel, sources, outreach by channel, fall-out), consent fields | You run a full week of BNI and outreach from the CRM alone |
| **2. Client care + documents** | Client sub-status, client documents, proposals, marketing library with send tracking, templates, referral/testimonial asks | Every client and proposal lives in the CRM, not in folders |
| **3. Booking + BNI engine + inbound** | Cal.com booking with auto-capture, website form (Framer → CRM), business-card scan, referrals given/received with the Rand value of closed business, one-to-one target tracking, campaigns screen | Bookings and website leads appear without typing |
| **4. Communications + AI** | BCC email logging, WhatsApp chat import, voice notes → summaries + tasks, relationship summaries, pre-meeting briefs, Monday brief | Most touches are captured without manual logging |
| **5. Deeper insights + integrations** | Ideal-client model, material effectiveness, QuickBooks invoice status for payment checks, optional Google Workspace calendar/email sync, WhatsApp API if justified | Decisions are made from the dashboards |

---

## 14. Tech and environments

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16.2 (App Router), React 19.2, TypeScript strict | Same as Konzult CFO |
| Database / auth / files | Supabase: **new dedicated projects**, EU region | Kept apart from the shared Vertical SaaS / CFO database |
| Hosting | Vercel (existing Pro seat), GitHub `Konzult-Analytics/konzult-crm` | Already set up |
| Styling | Tailwind 4, Konzult CI (`2026-konzult-analytics-CI-V2.html`: orange `#FF3210`, ink `#1A1714`, cream `#F7F4EE`) | On brand |
| Libraries | zod, SheetJS (Excel import), papaparse, vitest, Anthropic SDK (Phase 4) | Same as CFO |
| Package manager | pnpm | Disk budget |

| Environment | Database | Data |
|---|---|---|
| Local / Dev | `konzult-crm-dev` | Fake seed data only |
| Preview | `konzult-crm-dev` | Fake seed data only |
| Production | `konzult-crm-prod` | Real contacts |

---

## 15. Open decisions for Zander

| # | Decision | Recommendation | Blocks |
|---|---|---|---|
| 1 | Stage names: Prospect / Contacted / Meeting / Proposal / Client, or your Prospect+ / Pre-client | The short names (editable later) | Phase 1 |
| 2 | Exit reason lists (§3.3) | As drafted; adjust freely | Phase 1 |
| 3 | Two new Supabase projects (about US$10 each per month on a paid org; verify on your plan) | Yes | Phase 0 |
| 4 | Free about 3 GB on C: (currently 1.4 GB) | Needed before installing dependencies | Phase 0 |
| 5 | Android or iPhone? | — | WhatsApp share (Phase 4) |
| 6 | Move konzult.co.za email to Google Workspace? | Not needed until Phase 5 | Phase 5 |
| 7 | Team access for Yannick / Malcom / Karlien? | Later; the data model is ready | — |

---

## 16. Glossary

| Term | Meaning |
|---|---|
| Journey | One attempt to win someone as a client or partner |
| Touch | Any logged communication |
| Fit score | 0–100 from the four fit-check questions |
| Fall-out | Where and why a journey ended |
| Parked | "Not now", with a revisit date |
| PWA | A website that installs on your phone like an app |
| Webhook | An automatic message one system sends another when something happens (e.g. "someone booked") |
| RLS | Row-level security: the database itself enforces who can see which rows |
| TYFCB | BNI's "Thank You For Closed Business": the Rand value of closed referrals |
