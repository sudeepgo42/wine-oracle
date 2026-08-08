# Gatsby's Wine Oracle — Project Handoff

Current as of 27 July 2026. This package contains everything needed to redeploy
or hand this project to someone else.

## What's in this zip

```
index.html                          — the entire app (single file)
netlify.toml                        — Netlify build config
netlify/edge-functions/sommelier.js — server-side proxy to Anthropic's API
```

## What the app does

A personal sommelier tool, live at your Netlify URL, with four areas:

- **Wine List** — upload a PDF or photos of a wine list, set budget/style/food/
  occasion, and get 3–5 recommendations with reasoning, critic reviews (pulled
  live via search), and a star rating you can save.
- **Read a Label** — photograph a bottle's label (front, optionally back) and
  the app identifies it, with a confidence meter and the same critic lookup
  and rating tools.
- **My Taste** — a one-time onboarding quiz capturing red and white wine
  preferences separately (body, tannin, sweetness, oak, go-to grapes/regions,
  budget range, free-text notes). Shows a summary afterwards with an edit link.
- **Favourites** — every wine you've rated or kept, newest first, pulled from
  your own account's history.

Sign-in is via Supabase magic link (passwordless email). A "BETA TEST" button
on the login screen uses Supabase anonymous sign-in to skip email entirely —
useful for quick testing, each click creates its own anonymous identity.

## Architecture

- **Frontend**: single static HTML file (`index.html`), no build step, no
  framework. Vanilla JS throughout.
- **Wine list / label reasoning**: calls Anthropic's Claude API directly
  (model: `claude-sonnet-4-5`) via a Netlify Edge Function at `/api/sommelier`,
  which holds the `ANTHROPIC_API_KEY` server-side. Edge Functions were used
  specifically because standard Netlify serverless functions have a 10-second
  timeout on the free tier (26s even on paid) which a multi-page PDF read can
  exceed; Edge Functions don't share that ceiling.
- **Critic review lookup**: calls OpenRouter directly from the browser, using
  the `perplexity/sonar` model (built-in web search, cheap, fast). This key is
  hardcoded client-side in `index.html` — acceptable for this use case since
  it's a personal tool, but worth knowing it's visible in page source.
- **Auth & data**: Supabase (magic link auth + anonymous auth + Postgres with
  row-level security). Project ref: `aksjkadglsefsomeakkt`.

## Environment variables (set in Netlify dashboard)

| Name | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Used by the edge function to call Claude directly |
| `SECRETS_SCAN_OMIT_PATHS` | Set to `index.html` — tells Netlify's secret scanner to ignore the OpenRouter key intentionally embedded there |

## Supabase setup (current full state)

If rebuilding from scratch, run this in the Supabase SQL Editor:

```sql
-- Ratings table
create table wine_ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  wine_name text not null,
  region text,
  grape text,
  style text,
  price text,
  rating integer check (rating between 1 and 5),
  notes text,
  recommended_for text,
  created_at timestamptz default now()
);

alter table wine_ratings enable row level security;

create policy "Users can insert their own ratings"
  on wine_ratings for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can read their own ratings"
  on wine_ratings for select to authenticated using (auth.uid() = user_id);

-- Taste profile table (per-user, red/white split)
create table taste_profile (
  user_id uuid primary key references auth.users(id),
  body_pref text,
  tannin_pref text,
  sweetness_pref text,
  favorite_grapes text,
  favorite_regions text,
  red_body text,
  red_tannin text,
  red_oak text,
  red_grapes text,
  red_regions text,
  red_notes text,
  white_body text,
  white_sweetness text,
  white_oak text,
  white_grapes text,
  white_regions text,
  white_notes text,
  budget_low integer,
  budget_high integer,
  notes text,
  onboarded boolean default false,
  updated_at timestamptz default now()
);

alter table taste_profile enable row level security;

create policy "Users can read their own profile"
  on taste_profile for select to authenticated using (auth.uid() = user_id);
create policy "Users can insert their own profile"
  on taste_profile for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can update their own profile"
  on taste_profile for update to authenticated using (auth.uid() = user_id);
```

Also required in the Supabase dashboard:

- **Authentication → Providers**: enable **Anonymous Sign-Ins** (for the
  BETA TEST button)
- **Authentication → URL Configuration**: Site URL set to your live Netlify
  URL, so magic links redirect correctly

Note: `body_pref`, `tannin_pref`, `sweetness_pref`, `favorite_grapes`, and
`favorite_regions` are legacy columns from an earlier onboarding design and
are no longer written to by the current app — safe to ignore or drop.

## Deployment

This site is connected to a GitHub repository (not drag-and-drop deploy),
which is required for the edge function to build correctly:

- **Repo**: `sudeepgo42/wine-oracle` on GitHub
- **Netlify site**: connected to that repo, auto-deploys on push to `main`
- To update: replace `index.html` in the repo (or the edge function/toml if
  those change) and commit — Netlify picks it up automatically

## Known trade-offs / things to revisit later

- The OpenRouter key for critic lookups is visible in page source. Fine for
  personal use; would need a server-side proxy (like the Anthropic one) if
  this ever became multi-tenant or public-facing.
- Ratings made before user accounts existed are orphaned (no `user_id`) —
  intentionally left as-is per an earlier decision not to retrofit ownership.
- "My Taste" profile data isn't yet used to score wine list recommendations —
  it's captured and stored, but the matching logic (cross-referencing a
  scanned list against someone's taste profile and rating history) hasn't
  been built yet. That's the natural next feature.
- Design was rebuilt to the "Gatsby's Wine Oracle" direction per a build spec
  from Claude Design; a couple of interaction details (how "Keep" defaults to
  a rating, how "Share" behaves) were judgement calls made without an explicit
  spec line, noted at the time they were built.
