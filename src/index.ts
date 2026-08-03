import { Hono } from 'hono';
import { type JwtVariables, jwt, sign } from 'hono/jwt';
import { responsePolicy, securityHeaders } from './middleware/headers';

const JWT_EXPIRY_SECONDS = 15 * 60;

const app = new Hono<{ Bindings: Env; Variables: JwtVariables }>()
  // responsePolicy first: middleware unwinds in reverse, so securityHeaders' post-processing runs last
  // and would otherwise overwrite the per-response CSP chosen below it.
  .use('*', responsePolicy)
  .use('*', securityHeaders)
  .get('/api/health', c => {
    return c.json({ status: 'ok', timestamp: new Date().toISOString() });
  })
  .get('/api/hello', c => {
    return c.json({ message: 'Hello from Cloudflare Workers edge!' });
  })
  .post('/api/login', async c => {
    const apiKey = c.req.header('x-api-key');
    if (!apiKey || apiKey !== c.env.API_KEY) {
      return c.json({ error: 'Invalid API key' }, 401);
    }

    const now = Math.floor(Date.now() / 1000);
    const token = await sign({ sub: 'demo-client', iat: now, exp: now + JWT_EXPIRY_SECONDS }, c.env.JWT_SECRET, 'HS256');

    return c.json({ token, expiresIn: JWT_EXPIRY_SECONDS });
  })
  .get(
    '/api/protected',
    (c, next) => jwt({ secret: c.env.JWT_SECRET, alg: 'HS256' })(c, next),
    c => {
      return c.json({
        message: 'You reached a protected route',
        payload: c.get('jwtPayload'),
      });
    },
  );

export type AppType = typeof app;
export default app;
