import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';

const allowedOrigin = 'http://localhost:5173';
const app = createApp({ corsOrigins: [allowedOrigin] });

const exposed = (value: string | undefined): string[] =>
  (value ?? '').split(',').map((header) => header.trim().toLowerCase());

describe('CORS', () => {
  it('exposes Retry-After to an allowed origin, so that the web app can read it on 429', async () => {
    const res = await request(app).get('/health').set('Origin', allowedOrigin);

    expect(res.headers['access-control-allow-origin']).toBe(allowedOrigin);
    expect(exposed(res.headers['access-control-expose-headers'])).toContain('retry-after');
  });

  it('does not grant access to an origin outside the allow list', async () => {
    const res = await request(app).get('/health').set('Origin', 'https://evil.example');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
