import type { Context, Next } from 'hono';
import { secureHeaders } from 'hono/secure-headers';

/**
 * API responses should load nothing (`default-src 'none'`); documents are the app and would be broken
 * outright by that, so the CSP is chosen per-response in `responsePolicy` and this handles only what is
 * identical either way. Assets that bypass the Worker get their own copy from frontend/public/_headers,
 * which must be kept in sync with DOCUMENT_CSP.
 */
export const securityHeaders = secureHeaders({
  // Set in responsePolicy instead. Setting either here would win anyway - secureHeaders' post-processing
  // runs after responsePolicy's on the way out.
  contentSecurityPolicy: undefined,
  strictTransportSecurity: false,
  xFrameOptions: 'DENY',
  xContentTypeOptions: 'nosniff',
  referrerPolicy: 'no-referrer',
  crossOriginOpenerPolicy: 'same-origin',
  crossOriginResourcePolicy: 'same-origin',
  permissionsPolicy: {
    camera: [],
    microphone: [],
    geolocation: [],
    payment: [],
    usb: [],
  },
});

/** JSON responses load nothing and execute nothing. */
const API_CSP = "default-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

/**
 * No `'unsafe-inline'` in any directive, which is what makes React `style={{...}}` props unusable. Keep
 * in sync with the `/*` rule in frontend/public/_headers.
 */
const DOCUMENT_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/**
 * Vite's dev server injects an inline preamble script and opens an HMR socket, which no production-shaped
 * CSP can allow, so documents go out without one under `pnpm dev`. Deliberately `MODE`, not `DEV`: vitest
 * also reports `DEV === true`, which would make the suite assert the dev path.
 */
const isDevServer = import.meta.env?.MODE === 'development';

/**
 * HSTS is sent only over https, so plain-http LAN dev isn't pinned for a year. Cache-Control is only
 * defaulted when the handler didn't set one.
 */
export async function responsePolicy(c: Context, next: Next): Promise<void> {
  await next();

  if (c.req.path.startsWith('/api/')) {
    c.res.headers.set('Content-Security-Policy', API_CSP);
  } else if (isDevServer) {
    c.res.headers.delete('Content-Security-Policy');
  } else {
    c.res.headers.set('Content-Security-Policy', DOCUMENT_CSP);
  }

  if (new URL(c.req.url).protocol === 'https:') {
    c.res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  if (!c.res.headers.has('Cache-Control')) c.res.headers.set('Cache-Control', 'no-store');
}
