# cloudflare-template-app

A full-stack starter running entirely on Cloudflare Workers: [Hono](https://hono.dev)
for the API, [React 19](https://react.dev) + [Tailwind CSS 4](https://tailwindcss.com)
for the UI, and [Vite](https://vite.dev) via `@cloudflare/vite-plugin` for a single
`vite dev` / `vite build` pipeline that serves both.

## Stack

- **API**: Hono, with `secureHeaders()` (including a `Content-Security-Policy`)
  applied globally. No CORS middleware — the frontend and API share an origin,
  so cross-origin requests aren't needed and aren't allowed.
- **Frontend**: React 19, built with a type-safe RPC client (`hono/client`) against
  the worker's route types — no manual fetch typing needed
- **Auth demo**: a working `API_KEY` → JWT (`JWT_SECRET`) → protected-route flow,
  meant as a reference for wiring up real auth in a derived project
- **Testing**: Vitest via `@cloudflare/vitest-pool-workers`, running tests inside
  an actual `workerd` instance
- **Linting/formatting**: Biome
- **Deploy**: Wrangler, deploying static assets + the worker together

## Requirements

- Node 26+
- [Corepack](https://nodejs.org/api/corepack.html) enabled (`corepack enable`) —
  pins pnpm to the version in `package.json`

## Getting started

```sh
pnpm install
cp .dev.vars.example .dev.vars   # fill in local values
pnpm dev
```

`pnpm dev` starts Vite (via `@cloudflare/vite-plugin`), serving the React app and
the Hono API from the same origin.

## Secrets

This worker declares two required secrets in [wrangler.jsonc](wrangler.jsonc)
(`secrets.required`): `API_KEY` and `JWT_SECRET`.

- **Local dev**: put them in `.dev.vars` (gitignored — see `.dev.vars.example`).
- **Production**: set them with `wrangler secret put API_KEY` and
  `wrangler secret put JWT_SECRET` before deploying.

They power a demo auth flow in [src/index.ts](src/index.ts):

- `POST /api/login` — send `x-api-key: <API_KEY>`, get back a short-lived JWT
  signed with `JWT_SECRET`.
- `GET /api/protected` — send `Authorization: Bearer <token>`, get back the
  decoded JWT payload.

The frontend's "Protected API demo" card exercises this end to end. Treat this
as a template to replace with your own auth logic, not as production-grade auth.

> **Note:** `@cloudflare/vite-plugin` copies `.dev.vars` into `dist/` during
> `pnpm build` so the built worker can run locally with `wrangler dev` against
> the build output. `dist/` is gitignored — don't publish or ship that directory
> anywhere secrets shouldn't go.

## Routing

[wrangler.jsonc](wrangler.jsonc) sets `assets.run_worker_first: ["/api/*"]`, so
the worker handles API paths and Cloudflare's asset handler owns everything
else — including the `single-page-application` fallback that serves
`index.html` for unknown routes. Without that setting the worker is invoked for
every non-asset request and Hono's 404 pre-empts the fallback, so deep links
break.

The Vitest suite doesn't cover this — it bypasses the asset router — but
`pnpm dev` mirrors production routing exactly, so curling a deep link there is
a faithful check.

## Security headers

Static assets (the built HTML/JS/CSS) are served directly by Cloudflare's asset
handler and never reach the Hono app, so `secureHeaders()` in
[src/index.ts](src/index.ts) only covers `/api/*` responses. The page itself
gets its headers (including CSP) from
[frontend/public/_headers](frontend/public/_headers), which Vite copies
verbatim into `dist/client/` and Cloudflare applies to matching asset requests.
Keep the two in sync if you change the policy — they're deliberately not
generated from the same source since one is server middleware and the other is
a static config file. `xFrameOptions` is passed explicitly to `secureHeaders()`
because Hono defaults it to `SAMEORIGIN`, which had drifted from the `DENY` in
`_headers`; `form-action` is set explicitly in both because it does not fall
back to `default-src`. Anywhere the middleware defaults differ from the static
file, pin the middleware value rather than loosening the static one.

`_headers` also sets the cache policy: a second `/assets/*` rule marks Vite's
content-hashed bundles `immutable` for a year, while `index.html` keeps the
default `must-revalidate` so clients always pick up new builds.

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Start the Vite dev server (frontend + worker) |
| `pnpm build` | Build the frontend and worker into `dist/` |
| `pnpm deploy` | Build, then `wrangler deploy` against the generated config |
| `pnpm run deploy:worker` | Deploy the already-built worker (used by `pnpm deploy` and CI) |
| `pnpm types` | Regenerate `worker-configuration.d.ts` from config |
| `pnpm typecheck` | Type-check the worker and frontend with `tsc` |
| `pnpm test` | Run the Vitest suite against a real `workerd` |
| `pnpm lint` | Check formatting and lint rules with Biome |
| `pnpm format` | Auto-format with Biome |

`worker-configuration.d.ts` is generated (gitignored) — run `pnpm types` after
changing `wrangler.jsonc` (bindings, secrets, etc.), and again after
`pnpm install` in a fresh clone or CI checkout.

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs `types`, `lint`,
`typecheck`, `test`, and `build` on every push and pull request. Dependabot
([`.github/dependabot.yml`](.github/dependabot.yml)) keeps npm and GitHub
Actions dependencies up to date on a weekly schedule.

## Project layout

```
src/index.ts               Hono API (worker entry point)
frontend/src/
  App.tsx                  Route table (react-router)
  main.tsx                 React entry point
  index.css                Tailwind entry
  components/              Shared UI (Layout, ErrorBoundary)
  pages/                   One component per route
  lib/                     Non-component code (the RPC client)
frontend/public/           Static files copied as-is into dist/client/
tests/                     Vitest tests, run inside workerd
wrangler.jsonc             Worker + assets configuration
.github/                   CI workflow + Dependabot config
```

Frontend imports use two path aliases instead of relative traversal:
`@/*` for anything under `frontend/src/`, and `@worker` for the Hono app's
exported `AppType`. Both are declared in
[vite.config.ts](vite.config.ts) and [frontend/tsconfig.json](frontend/tsconfig.json)
and must be kept in step — Vite resolves the runtime import, TypeScript
resolves the type.
