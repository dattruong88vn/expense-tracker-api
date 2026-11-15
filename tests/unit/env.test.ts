import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/config/env.js';

const valid = {
  MONGODB_URI: 'mongodb://localhost:27017/expense-tracker',
  JWT_SECRET: 'x'.repeat(32),
  GOOGLE_CLIENT_ID: 'client-id.apps.googleusercontent.com',
};

describe('loadEnv', () => {
  it('applies defaults when optional variables are absent', () => {
    const env = loadEnv(valid);

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.JWT_EXPIRES_IN).toBe('7d');
    expect(env.CORS_ORIGINS).toEqual([]);
  });

  it('reads PORT from the environment and splits CORS_ORIGINS', () => {
    const env = loadEnv({
      ...valid,
      PORT: '8080',
      CORS_ORIGINS: 'http://localhost:5173, https://example.org ,',
    });

    expect(env.PORT).toBe(8080);
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:5173', 'https://example.org']);
  });

  it('fails fast when a required variable is missing', () => {
    expect(() => loadEnv({ ...valid, GOOGLE_CLIENT_ID: undefined })).toThrow(/GOOGLE_CLIENT_ID/);
  });

  it('rejects a short JWT secret without echoing its value', () => {
    const run = (): unknown => loadEnv({ ...valid, JWT_SECRET: 'tooshort' });

    expect(run).toThrow(/JWT_SECRET: must contain at least 32 characters/);
    expect(run).not.toThrow(/tooshort/);
  });

  it('rejects an invalid MongoDB connection string and port', () => {
    expect(() => loadEnv({ ...valid, MONGODB_URI: 'http://db' })).toThrow(/MONGODB_URI/);
    expect(() => loadEnv({ ...valid, PORT: '70000' })).toThrow(/PORT/);
  });
});
