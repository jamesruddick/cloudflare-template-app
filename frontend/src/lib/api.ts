import type { AppType } from '@worker';
import { hc } from 'hono/client';

export const client = hc<AppType>('/');
