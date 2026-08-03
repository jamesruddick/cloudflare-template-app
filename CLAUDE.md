# CLAUDE.md

## Overview

Full-stack Cloudflare Workers template: Hono API + React 19 + Tailwind CSS 4,
deployed as a single Worker via Wrangler. Fork it, keep the plumbing (build
pipeline, RPC typing, security headers, test harness), replace the demo
routes/UI/auth with real ones.

## Commands

```sh
pnpm install
cp .dev.vars.example .dev.vars   # required for pnpm dev
pnpm dev                         # Vite dev server — frontend + worker, one origin
pnpm build                       # wrangler types + frontend tsc + vite build -> dist/
pnpm deploy                      # build, then deploy:worker
pnpm run deploy:worker           # wrangler deploy against generated config (no build)
pnpm typecheck                   # wrangler types + tsc (worker) + tsc (frontend)
pnpm lint                        # biome check .
pnpm format                      # biome format --write .
pnpm test                        # vitest run — full suite against real workerd
pnpm types                       # regenerate worker-configuration.d.ts from wrangler.jsonc
```

Run a single test:

```sh
pnpm exec vitest run tests/api.test.ts
pnpm exec vitest run -t "sets Content-Security-Policy on API responses"
```

---

## Architecture

### Build pipeline

One Vite pipeline builds two outputs. `vite.config.ts` at the repo root sets
`root: "frontend"`; the `cloudflare()` plugin reads `wrangler.jsonc` and adds a
Worker environment alongside the client environment. A single `vite build`
produces `dist/client/` (static assets) and a Worker bundle. Don't add a
`vite build` step inside `frontend/package.json` — `frontend/`'s `build` script
is `tsc` (type-check only). Vite plugins (`@vitejs/plugin-react`,
`@tailwindcss/vite`, `@cloudflare/vite-plugin`) live in the **root**
`package.json`, not `frontend/`.

### Workspace layout

Two-package pnpm workspace (`.` and `frontend/`), one deployable unit. Split
only for separate `tsconfig.json`/`package.json` concerns (different `lib`,
JSX settings, React deps). Both extend `tsconfig.base.json` — add shared
compiler options there, not in both children.

```
src/index.ts               Hono API (worker entry point)
src/middleware/headers.ts  Security headers + per-response CSP/HSTS/cache policy
frontend/src/
  App.tsx                  Route table (react-router v8)
  main.tsx                 React entry point
  index.css                Tailwind entry
  components/
    ui/                    Reusable primitives (Card, Button, Input)
    Layout.tsx             Shell chrome with <Outlet />
    ErrorBoundary.tsx      React error boundary
    AuthDemo.tsx           Self-contained auth demo widget
  pages/                   One default-exported component per route
  lib/                     Non-component code (RPC client, useHead hook)
frontend/public/           Static files copied to dist/client/ (including _headers)
tests/                     Vitest tests, run inside workerd
```

### Import aliases

`@/*` maps to `frontend/src/`, `@worker` maps to `src/index.ts`. Both are
declared in `vite.config.ts` (runtime) **and** `frontend/tsconfig.json`
(type-checker). Add to one without the other and you get a build/typecheck
mismatch. `baseUrl` is not used — `paths` entries need a leading `./`.

### Type-safe RPC

`frontend/src/lib/api.ts` does `hc<AppType>("/")`, importing `AppType` from
`@worker`. Hono's method-chained route builder makes this work — **breaking the
chain** (separate `app.get(...)` statements instead of `.get(...).post(...)`)
loses accumulated route types and breaks the client's type inference.

### SPA routing

`wrangler.jsonc` sets `assets.run_worker_first: ["/api/*"]` — the Worker
handles only API paths, everything else goes to Cloudflare's asset handler with
`not_found_handling: "single-page-application"`. Without this, the Worker is
invoked for every non-asset request and Hono's 404 pre-empts the fallback,
breaking deep links. `App.tsx` uses `createBrowserRouter` (from `react-router`,
not `react-router-dom`) with a catch-all `*` route for `NotFound.tsx`.

### Generated types

`worker-configuration.d.ts` is generated and gitignored — defines the global
`Env` type. Regenerate with `pnpm types` after editing `wrangler.jsonc`
(bindings, secrets) or after a fresh clone. `pnpm build` and `pnpm typecheck`
already do this. There is no `@cloudflare/workers-types` package — don't add one.

---

## Code Standards

### Component architecture

UI is organized as reusable building blocks. Shared primitives live in
`components/ui/` and are re-exported from `components/ui/index.ts`:

- **`Card`** — neutral container with border, shadow, dark mode
- **`Button`** — primary action button with disabled state
- **`ButtonLink`** — same styling as Button but renders a react-router `Link`
- **`Input`** — styled text input with focus ring and dark mode

Use these instead of duplicating Tailwind class strings. When adding new
primitives, follow the same pattern: accept `ComponentProps<element>`, spread
props, compose `className` with a `base` constant.

### File organization

- **Group by kind**: `components/`, `pages/`, `lib/` — not by feature
- **One default export per page**, matching the route it serves
- **Self-contained feature widgets** (like `AuthDemo`) go in `components/`
  with their own state, not in `pages/`
- **Don't create empty folders** — add a directory when something goes in it

### Dependency placement

Does it ship in the deployed artifact? Then `dependencies`. Everything else
(`wrangler`, `vite`, `typescript`, `vitest`, `biome`, `tailwindcss`, plugins)
is `devDependencies`. Apply the same test when adding packages.

### Style rules

- Tailwind classes only — no inline `style={{...}}` props (blocked by CSP)
- Biome is the sole lint/format tool — don't add ESLint or Prettier
- Don't swap the RPC client (`hc`) for manual `fetch` typing

---

## Security

### Headers — dual maintenance

Static assets and API responses have **separate** header sources that must be
kept in sync:

| Scope | Source | Covers |
|-------|--------|--------|
| HTML/JS/CSS | `frontend/public/_headers` | All static asset responses |
| Worker responses | `src/middleware/headers.ts` | All Hono route responses |

Both set: CSP, HSTS (preload), X-Frame-Options DENY, X-Content-Type-Options,
Referrer-Policy, COOP, CORP, Permissions-Policy.

### Content Security Policy

The CSP is chosen **per response** in `responsePolicy`, because API and document
responses have opposite needs:

- **`/api/*`** — `default-src 'none'; base-uri 'self'; form-action 'self';
  frame-ancestors 'none'`. JSON loads nothing and executes nothing, so the API
  gets the strictest possible policy.
- **Everything else** — the document CSP below, which must stay in sync with the
  `/*` rule in `frontend/public/_headers`.

```
default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:;
font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self';
form-action 'self'; frame-ancestors 'none'
```

No `'unsafe-inline'` in any directive. Since `style-src` has no
`'unsafe-inline'`, React `style={{...}}` props are blocked under CSP3 — use
Tailwind classes instead.

Two deliberate carve-outs in `responsePolicy`:

- **Dev server** — Vite injects an inline preamble script and opens an HMR
  socket, which no production-shaped CSP can allow, so documents go out without
  a CSP under `pnpm dev`. Gated on `import.meta.env.MODE === 'development'`,
  **not** `DEV` — vitest also sets `DEV === true`, which would make the suite
  assert the dev path.
- **HSTS** — only sent when the request arrived over https, so plain-http LAN
  dev isn't pinned for a year.

`responsePolicy` is registered **before** `securityHeaders`. Middleware unwinds
in reverse, so `securityHeaders`' post-processing runs last and would otherwise
overwrite the per-response CSP.

### Permissions-Policy

Both `_headers` and `securityHeaders` in `src/middleware/headers.ts` restrict
sensitive browser APIs: `camera`, `microphone`, `geolocation`, `payment`, `usb`
— all set to `()` (deny). Extend both files when adding features that need
browser permissions.

### CORS

Intentionally absent. Frontend and API share an origin. Don't add `hono/cors`
without a concrete cross-origin requirement — any allowlist is added attack
surface.

### Auth

Demo implementation only: `POST /api/login` exchanges a static `API_KEY` for a
short-lived JWT (15 min); `GET /api/protected` validates it. Both secrets are
declared in `wrangler.jsonc` under `secrets.required`. Replace this flow with
real auth — it exists to demonstrate the wiring.

---

## SEO

### Static meta (index.html)

- `<meta name="description">` — update for your project
- Open Graph tags: `og:type`, `og:title`, `og:description`, `og:site_name`
- Twitter Card: `summary` card with title and description
- `<meta name="color-scheme" content="light dark">` for system theme support
- `<link rel="icon" href="/favicon.svg">` — SVG favicon

### Dynamic head management (useHead hook)

`lib/use-head.ts` provides a `useHead()` hook for per-page:

- **`title`** — sets `document.title` as `"Page | Site Name"`, restores on unmount
- **`description`** — updates the meta description tag, restores on unmount
- **`canonical`** — creates/updates `<link rel="canonical">`, cleans up on unmount

Every page component should call `useHead()` with at minimum a `title`. For
production, set `canonical` to the full URL to avoid duplicate content issues.

### Crawler guidance

`robots.txt` allows `/` and disallows `/api/` — crawlers shouldn't index API
endpoints. For production, add a `sitemap.xml` to `frontend/public/` pointing
to your canonical URLs.

### SPA limitation

Without SSR, crawlers see only `index.html`'s static meta tags. The `useHead()`
hook updates the DOM client-side, which modern crawlers (Googlebot) handle, but
isn't guaranteed for all. If SEO is critical, consider Cloudflare Workers SSR
or a prerender service.

---

## Performance

### Caching strategy

`_headers` defines the cache policy for static assets:

- **`/assets/*`** — `public, max-age=31536000, immutable`. Vite content-hashes
  these filenames, making them safe to cache indefinitely.
- **`/index.html`** — `no-cache, must-revalidate`, set explicitly. The filename
  never changes, so hard-caching would pin clients to stale builds.
- **`/favicon.svg`** — one day. Unhashed, but cheap to re-fetch.

Worker responses are separate: `responsePolicy` defaults them to `no-store`
unless the handler set its own `Cache-Control`. Keep this split when adding rules.

### Build optimization

- Single Vite build produces both client and worker bundles — no duplicate work
- Tree-shaking via ESM (`"type": "module"` everywhere)
- Tailwind CSS 4 with Vite plugin — only ships used utility classes
- Source maps uploaded to Cloudflare (`upload_source_maps: true`) for production
  debugging without serving them to clients

### Runtime

- Workers execute at the edge — no cold-start latency from centralized servers
- `nodejs_compat` flag enabled for Node.js API compatibility in Workers
- Static assets served by Cloudflare's asset handler (CDN), not the Worker

---

## Testing

### Framework

Vitest via `@cloudflare/vitest-pool-workers` — tests run inside real `workerd`,
not mocks or jsdom. Test bindings (`API_KEY`/`JWT_SECRET`) are set in
`vitest.config.ts` under `miniflare.bindings`, independent of `.dev.vars`.

### Coverage

Tests cover two areas:

1. **API route behavior** — status codes, response shapes, auth flow (valid key,
   invalid key, missing key, valid token, invalid token, missing token)
2. **Security headers** — the `default-src 'none'` API CSP, HSTS presence over
   https and *absence* over plain http, the `no-store` default,
   X-Frame-Options, X-Content-Type-Options, Permissions-Policy

Fetch with an `http://` URL to exercise the non-https branch — `SELF.fetch`
honours the scheme you give it.

### What tests cannot cover

The vitest suite bypasses the static-asset router — `SELF` binds directly to the
Worker, so `run_worker_first` and `not_found_handling` aren't exercised. Verify
asset routing via `pnpm dev` (which mirrors production routing) or
`wrangler dev -c dist/<name>/wrangler.json` against the built artifact.

### Adding tests

- Test files go in `tests/`, named `*.test.ts`
- Use `SELF.fetch(...)` from `cloudflare:test` to exercise the full Hono app
- Don't import handlers directly — test the whole request/response cycle
- Don't add a jsdom runner or mock the Workers runtime

---

## Constraints

These are load-bearing architectural decisions, not incidental choices:

- **Don't introduce ESLint/Prettier** — Biome is the only lint/format tool
- **Don't swap the RPC client** for manual `fetch` typing
- **Don't move tests to jsdom** — they must run in real `workerd`
- **Don't add `@cloudflare/workers-types`** — types come from the generated file
- **Don't add a `vite build` inside `frontend/`** — bundling happens at the root
- **Don't remove `run_worker_first`** — deep links break without it
- **Don't delete `_headers`** — it's the only CSP covering static assets
- **Don't use `style={{...}}` props** — blocked by the strict CSP
- **Don't break the Hono method chain** — route type inference depends on it
- **Keep `hono` in `dependencies`**, not `devDependencies` — it ships in the Worker

---

## Deployment

### Deploy command

`pnpm deploy` builds then runs `deploy:worker`, which passes
`-c dist/cloudflare_template_app/wrangler.json` explicitly. That directory name
derives from the worker `name` in `wrangler.jsonc` (dashes → underscores) —
rename the worker and update the script.

### Why the explicit `-c` flag

The Vite plugin writes its deploy config to `frontend/.wrangler/deploy/config.json`.
A bare `wrangler deploy` from the root misses it, silently falls back to
`wrangler.jsonc`, and re-bundles with esbuild instead of shipping the Vite-built
worker. Explicit `-c` fails loudly when the build output is missing.

### No environments

The generated `dist/<name>/wrangler.json` has `"definedEnvironments": []`. If you
add `env.preview`/`env.production` to `wrangler.jsonc`, `--env preview` is
silently ignored. Use per-environment builds via the plugin's `config` customizer
(mutating-function form — the object form appends to arrays and produces
duplicates).

### Secrets

`API_KEY` and `JWT_SECRET` are declared in `wrangler.jsonc` under
`secrets.required`. Set locally in `.dev.vars`, in production via
`wrangler secret put`.

`vite.config.ts` reads that same `secrets.required` list and **hard-fails
`pnpm dev`** when one is missing or empty, because Wrangler only warns — the
server would otherwise start and then fail at request time, with the warning
scrolled off the top of the banner. Adding a secret to `wrangler.jsonc` is all
that's needed; the check can't drift. A value exported in the shell counts.
Builds skip the check (`command === 'serve'` only) — CI has no `.dev.vars`.

### CI

`.github/workflows/ci.yml` runs three jobs on every push/PR:

- **`check`** — `types` → `lint` → `typecheck` → `build` → `test` →
  `deploy:worker --dry-run`
- **`audit`** — `pnpm audit --audit-level moderate`, deliberately a separate job
  so a new advisory and a broken test can't hide behind each other
- **`dependency-review`** — PRs only; flags newly-added dependencies carrying a
  known advisory before they reach the lockfile

Actions are **pinned to commit SHAs**, not tags — a tag is mutable and whoever
controls the action's repo could repoint it at code that runs against our
checkout. The trailing `# vX.Y.Z` comment is the human-readable version; update
both together.

Node comes from `.node-version` via `node-version-file`, so the engine floor
lives in one place.

### Dependabot

`.github/dependabot.yml` covers npm (one entry — pnpm resolves the whole
workspace into a single lockfile, so a second `/frontend` entry would only
duplicate PRs) and GitHub Actions, weekly.

The `cooldown` block is the supply-chain guard that actually binds. pnpm's
`minimumReleaseAge` does **not** apply to Dependabot: it resolves and writes the
lockfile itself, and CI then installs exactly that under `--frozen-lockfile`.
Without the cooldown, a compromised release could be merged the day it ships.
Security updates ignore cooldown, so real advisories are still fixed at once.
