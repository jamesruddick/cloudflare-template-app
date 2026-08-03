import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

describe('Worker API Routes', () => {
  it('GET /api/health returns 200 and ok status', async () => {
    const response = await SELF.fetch('https://example.com/api/health');
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('status', 'ok');
  });

  it('GET /api/health returns a valid ISO timestamp', async () => {
    const response = await SELF.fetch('https://example.com/api/health');
    const data = await response.json<{ timestamp: string }>();
    const parsed = new Date(data.timestamp);
    expect(parsed.toISOString()).toBe(data.timestamp);
  });

  it('GET /api/hello returns a greeting message', async () => {
    const response = await SELF.fetch('https://example.com/api/hello');
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('message');
  });

  it('POST /api/login rejects a request with no API key header', async () => {
    const response = await SELF.fetch('https://example.com/api/login', {
      method: 'POST',
    });
    expect(response.status).toBe(401);
  });

  it('POST /api/login rejects an invalid API key', async () => {
    const response = await SELF.fetch('https://example.com/api/login', {
      method: 'POST',
      headers: { 'x-api-key': 'wrong-key' },
    });
    expect(response.status).toBe(401);
  });

  it('POST /api/login issues a JWT for a valid API key', async () => {
    const response = await SELF.fetch('https://example.com/api/login', {
      method: 'POST',
      headers: { 'x-api-key': 'test-api-key' },
    });
    expect(response.status).toBe(200);

    const data = await response.json<{ token: string; expiresIn: number }>();
    expect(typeof data.token).toBe('string');
    expect(data.expiresIn).toBeGreaterThan(0);
  });

  it('GET /api/protected rejects requests without a token', async () => {
    const response = await SELF.fetch('https://example.com/api/protected');
    expect(response.status).toBe(401);
  });

  it('GET /api/protected rejects a malformed Bearer token', async () => {
    const response = await SELF.fetch('https://example.com/api/protected', {
      headers: { Authorization: 'Bearer not.a.valid.jwt' },
    });
    expect(response.status).toBe(401);
  });

  it('GET /api/protected accepts a token minted by /api/login', async () => {
    const loginResponse = await SELF.fetch('https://example.com/api/login', {
      method: 'POST',
      headers: { 'x-api-key': 'test-api-key' },
    });
    const { token } = await loginResponse.json<{ token: string }>();

    const response = await SELF.fetch('https://example.com/api/protected', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(200);

    const data = await response.json<{ payload: Record<string, unknown> }>();
    expect(data.payload).toHaveProperty('sub', 'demo-client');
  });
});

describe('Security Headers', () => {
  it('locks API responses down to default-src none', async () => {
    const response = await SELF.fetch('https://example.com/api/health');
    const csp = response.headers.get('Content-Security-Policy');
    // JSON loads and executes nothing, so the API CSP is strictly tighter than the document one.
    expect(csp).toContain("default-src 'none'");
    expect(csp).not.toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('sets Strict-Transport-Security with preload over https', async () => {
    const response = await SELF.fetch('https://example.com/api/health');
    const hsts = response.headers.get('Strict-Transport-Security');
    expect(hsts).toContain('max-age=31536000');
    expect(hsts).toContain('includeSubDomains');
    expect(hsts).toContain('preload');
  });

  it('omits Strict-Transport-Security over plain http', async () => {
    // Plain-http LAN dev must not pin the host for a year.
    const response = await SELF.fetch('http://localhost/api/health');
    expect(response.headers.get('Strict-Transport-Security')).toBeNull();
  });

  it('defaults API responses to no-store', async () => {
    const response = await SELF.fetch('https://example.com/api/health');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('sets X-Frame-Options to DENY', async () => {
    const response = await SELF.fetch('https://example.com/api/health');
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('sets X-Content-Type-Options to nosniff', async () => {
    const response = await SELF.fetch('https://example.com/api/health');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('sets Permissions-Policy restricting sensitive features', async () => {
    const response = await SELF.fetch('https://example.com/api/health');
    const pp = response.headers.get('Permissions-Policy');
    expect(pp).toBeTruthy();
    expect(pp).toContain('camera=()');
    expect(pp).toContain('microphone=()');
    expect(pp).toContain('geolocation=()');
  });

  it('applies security headers to all API routes', async () => {
    const response = await SELF.fetch('https://example.com/api/hello');
    expect(response.headers.get('Content-Security-Policy')).toBeTruthy();
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
  });
});
