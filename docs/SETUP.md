# Phase 0 set-up runbook

What's needed to go from code to "I can log in on my laptop and phone". Steps marked **Zander** need your accounts or passwords; Claude does the rest.

## 1. Supabase projects (Zander)

In the Supabase organisation that holds the Vertical SaaS / CFO project:

| Setting | Dev | Prod |
|---|---|---|
| Name | `konzult-crm-dev` | `konzult-crm-prod` |
| Region | West EU (Ireland) | West EU (Ireland) |
| Database password | Generate; save in your password manager | Generate; save in your password manager |

Send Claude both Project IDs (Project Settings → General). They are not secret.

## 2. Connect the Supabase CLI (Zander, once)

In a terminal in this folder:

```bash
supabase login
```

```bash
supabase link --project-ref <dev-project-id>
```

`login` opens your browser. `link` asks for the dev database password.

## 3. Set up the dev database (Claude)

- `supabase db push`: applies `supabase/migrations/` (workspaces, two-factor row-level security).
- `supabase config push`: turns sign-ups off and authenticator-app codes on, from `supabase/config.toml`.
- Writes `.env.local` with the dev URL and publishable key (never the secret keys).

## 4. Create your dev login (Zander)

Supabase dashboard → `konzult-crm-dev` → Authentication → Users → **Add user** → Create new user:

- Email: a dev-only address, e.g. `zander+dev@konzult.co.za`
- Password: a new one (not your real one)
- Tick **Auto Confirm User**

The first account in a project automatically becomes owner of the "Konzult" workspace.

## 5. First login on the laptop (Zander + Claude)

Claude starts the app (`pnpm dev`). Open http://localhost:3000, log in, scan the QR code with your authenticator app, enter the code. The set-up check page should show three ticks.

## 6. GitHub and Vercel (Zander, then Claude)

1. On GitHub, create an **empty private** repo `Konzult-Analytics/konzult-crm` (no README).
2. Tell Claude to push. Claude pushes `feature/phase0-setup`; you open the pull request and merge to `main`.
3. Vercel → Add New → Project → import `konzult-crm`.
   - Settings → Functions → Region: **Dublin (dub1)**, next to the database.
   - Environment variables:

| Variable | Production | Preview |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | prod project URL | dev project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | prod publishable key | dev publishable key |

## 7. Production database (Claude, with your go-ahead)

Same as step 3 against `konzult-crm-prod`. The prod auth settings (site URL = the Vercel domain) go in `supabase/config.toml` under a `[remotes.prod]` block first. Then create your real login in the prod dashboard (step 4, with your real email).

## 8. Phone (Zander)

Open the production URL on your phone, log in, and add it to the home screen:

- **iPhone:** Share → Add to Home Screen
- **Android:** ⋮ → Install app

Phase 0 is done when this works.
