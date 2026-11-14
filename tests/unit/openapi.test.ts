import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildOpenApiDocument, serializeOpenApiDocument } from '../../src/openapi/document.js';
import {
  googleSignInRequestSchema,
  pendingDeletionErrorResponseSchema,
  sessionResponseSchema,
} from '../../src/schemas/auth.schema.js';
import { errorCodes, errorCodeStatus } from '../../src/schemas/common.schema.js';
import { testTokenRequestSchema } from '../../src/schemas/test-auth.schema.js';

const doc = buildOpenApiDocument();
const paths = doc.paths ?? {};

type Operation = { responses?: Record<string, unknown>; security?: unknown[]; tags?: string[] };
function operation(path: string, method: string): Operation {
  const item = paths[path] as Record<string, Operation> | undefined;
  const op = item?.[method];
  if (!op) throw new Error(`missing ${method.toUpperCase()} ${path}`);
  return op;
}
const statuses = (path: string, method: string): string[] =>
  Object.keys(operation(path, method).responses ?? {}).sort();

describe('OpenAPI document', () => {
  it('is OpenAPI 3.1 and declares the bearerAuth and testAuthSecret schemes', () => {
    expect(doc.openapi).toBe('3.1.0');
    expect(Object.keys(doc.components?.securitySchemes ?? {}).sort()).toEqual([
      'bearerAuth',
      'testAuthSecret',
    ]);
  });

  it.each([
    ['/api/v1/auth/google', 'post', ['200', '201', '400', '401', '403', '429', '500']],
    ['/api/v1/auth/me', 'get', ['200', '401', '500']],
    ['/api/v1/auth/me', 'delete', ['204', '401', '500']],
    ['/api/v1/auth/restore', 'post', ['200', '400', '401', '404', '409', '429', '500']],
    ['/api/v1/test/auth/token', 'post', ['200', '201', '400', '401', '403', '404', '429', '500']],
    ['/api/v1/test/users/me', 'delete', ['204', '401', '403', '404', '429', '500']],
  ])('documents %s %s with its status codes', (path, method, expected) => {
    expect(statuses(path, method)).toEqual([...expected].sort());
  });

  it('protects the session endpoints with bearerAuth only', () => {
    expect(operation('/api/v1/auth/me', 'get').security).toEqual([{ bearerAuth: [] }]);
    expect(operation('/api/v1/auth/me', 'delete').security).toEqual([{ bearerAuth: [] }]);
    expect(operation('/api/v1/auth/google', 'post').security).toBeUndefined();
    expect(operation('/api/v1/auth/restore', 'post').security).toBeUndefined();
  });

  it('tags the test-only routes and requires the test secret', () => {
    for (const [path, method] of [
      ['/api/v1/test/auth/token', 'post'],
      ['/api/v1/test/users/me', 'delete'],
    ] as const) {
      const op = operation(path, method);
      expect(op.tags).toEqual(['test-only']);
      expect(JSON.stringify(op.security)).toContain('testAuthSecret');
      expect(JSON.stringify(op)).toContain('does not exist in production');
    }
  });

  it('declares Retry-After on every 429 response', () => {
    const json = JSON.stringify(paths);
    const count429 = (json.match(/"429":/g) ?? []).length;
    expect(count429).toBe(4);
    expect((json.match(/"Retry-After"/g) ?? []).length).toBe(count429);
  });

  it('enumerates every error code in the ErrorResponse schema', () => {
    const schema = JSON.stringify(doc.components?.schemas?.ErrorResponse);
    for (const code of errorCodes) expect(schema).toContain(`"${code}"`);
    expect(Object.keys(errorCodeStatus).sort()).toEqual([...errorCodes].sort());
  });

  it('matches the committed openapi.json (run npm run openapi:generate)', () => {
    const committed = readFileSync(
      fileURLToPath(new URL('../../openapi.json', import.meta.url)),
      'utf8',
    );
    expect(committed).toBe(serializeOpenApiDocument());
  });
});

describe('auth contract schemas', () => {
  it('rejects unknown properties and empty tokens on sign-in', () => {
    expect(googleSignInRequestSchema.safeParse({ idToken: 'x' }).success).toBe(true);
    expect(googleSignInRequestSchema.safeParse({ idToken: '' }).success).toBe(false);
    expect(googleSignInRequestSchema.safeParse({ idToken: 'x', $where: '1' }).success).toBe(false);
    expect(googleSignInRequestSchema.safeParse({ idToken: { $gt: '' } }).success).toBe(false);
  });

  it('describes a 7-day Bearer session for an active account', () => {
    const session = {
      token: 'jwt',
      tokenType: 'Bearer',
      expiresAt: '2026-11-08T01:00:00.000Z',
      user: {
        id: '6750a1b2c3d4e5f6a7b8c9d0',
        email: 'an.nguyen@example.com',
        name: 'An Nguyen',
        avatarUrl: null,
        currency: 'VND',
        status: 'active',
        createdAt: '2026-11-01T01:00:00.000Z',
      },
    };
    expect(sessionResponseSchema.safeParse(session).success).toBe(true);
    expect(sessionResponseSchema.safeParse({ ...session, tokenType: 'Basic' }).success).toBe(false);
  });

  it('signals pending deletion with whole remaining days (ET-11 AC-02: 8)', () => {
    const body = (remainingDays: number) => ({
      error: {
        code: 'ACCOUNT_PENDING_DELETION',
        message: 'The account is pending deletion',
        details: [
          {
            remainingDays,
            deletionRequestedAt: '2026-11-01T03:00:00.000Z',
            permanentDeletionAt: '2026-12-01T03:00:00.000Z',
          },
        ],
      },
    });
    expect(pendingDeletionErrorResponseSchema.safeParse(body(8)).success).toBe(true);
    expect(pendingDeletionErrorResponseSchema.safeParse(body(0)).success).toBe(true);
    expect(pendingDeletionErrorResponseSchema.safeParse(body(8.9)).success).toBe(false);
    expect(pendingDeletionErrorResponseSchema.safeParse(body(-1)).success).toBe(false);
  });

  it('restricts test user keys to the reserved namespace charset', () => {
    expect(testTokenRequestSchema.safeParse({ userKey: 'api-01_run' }).success).toBe(true);
    expect(testTokenRequestSchema.safeParse({ userKey: 'a|b' }).success).toBe(false);
    expect(testTokenRequestSchema.safeParse({ userKey: 'x'.repeat(65) }).success).toBe(false);
  });
});
