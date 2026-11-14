import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  type ResponseConfig,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import {
  googleSignInRequestSchema,
  pendingDeletionErrorResponseSchema,
  RECOVERY_PERIOD_DAYS,
  restoreAccountRequestSchema,
  SESSION_VALIDITY_DAYS,
  sessionResponseSchema,
  userProfileSchema,
} from '../schemas/auth.schema.js';
import { errorResponseSchema, validationErrorResponseSchema } from '../schemas/common.schema.js';
import { TEST_GOOGLE_ID_PREFIX, testTokenRequestSchema } from '../schemas/test-auth.schema.js';

const SIGN_IN_LIMIT =
  'at most 5 requests in any 60 minutes and at most 10 requests in any 24 hours per client IP address, over rolling windows (NFR-03); every request counts, whatever its outcome.';
const TEST_ROUTER_NOTICE =
  'Test-only (ADR-0005). This operation does not exist in production. The router is mounted only when `APP_ENV` is `test` or `staging`, `TEST_AUTH_ENABLED` is `true` and `TEST_AUTH_SECRET` holds at least 32 characters; otherwise the path returns 404 `NOT_FOUND` like any unknown path. Every request presents the secret in the `X-Test-Auth-Secret` header (constant-time comparison). Rate-limited to 600 requests per client IP address in any 60 minutes.';

function buildRegistry(): OpenAPIRegistry {
  const registry = new OpenAPIRegistry();

  // Component names come from each schema's `.meta({ id })`. `registry.register` is not used because the
  // library loads the CommonJS build of Zod, whose prototypes differ from the ESM build used here;
  // Zod's global metadata registry, in contrast, is shared by both builds.
  const ErrorResponse = errorResponseSchema;
  const ValidationErrorResponse = validationErrorResponseSchema;
  const UserProfile = userProfileSchema;
  const SessionResponse = sessionResponseSchema;
  const PendingDeletionErrorResponse = pendingDeletionErrorResponseSchema;
  const GoogleSignInRequest = googleSignInRequestSchema;
  const RestoreAccountRequest = restoreAccountRequestSchema;
  const TestTokenRequest = testTokenRequestSchema;

  const bearerAuth = registry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: `System session token returned by \`POST /api/v1/auth/google\`, valid for ${String(SESSION_VALIDITY_DAYS)} days. Rejected with 401 \`UNAUTHENTICATED\` when missing, malformed, altered or expired, or when its account does not exist or is pending deletion.`,
  });
  const testAuthSecret = registry.registerComponent('securitySchemes', 'testAuthSecret', {
    type: 'apiKey',
    in: 'header',
    name: 'X-Test-Auth-Secret',
    description: 'Secret of the test-only router (ADR-0005). Not configured in production.',
  });

  const json = (schema: z.ZodType) => ({ 'application/json': { schema } });
  const error = (description: string): ResponseConfig => ({
    description,
    content: json(ErrorResponse),
  });
  const validation: ResponseConfig = {
    description:
      '`VALIDATION_ERROR`: the body is not JSON, a required property is missing or invalid, or an unknown property is present.',
    content: json(ValidationErrorResponse),
  };
  const unauthenticated = error(
    '`UNAUTHENTICATED`: the bearer token is missing, malformed, altered or expired, or the account does not exist or is pending deletion. The client clears the stored token and returns to the sign-in screen.',
  );
  const rateLimited = (limit: string): ResponseConfig => ({
    description: `\`RATE_LIMITED\`: the limit of this endpoint is exhausted: ${limit} The client suggests trying again later.`,
    headers: {
      'Retry-After': {
        description: 'Seconds until the next request from this address can be accepted.',
        schema: { type: 'integer', minimum: 1 },
      },
    },
    content: json(ErrorResponse),
  });
  const internal = error('`INTERNAL_ERROR`: unexpected server error.');
  const pendingDeletion: ResponseConfig = {
    description: `\`ACCOUNT_PENDING_DELETION\`: the account is pending deletion and fewer than ${String(RECOVERY_PERIOD_DAYS)} days have elapsed since the request. No session is issued. The client shows the restoration dialog with \`details[0].remainingDays\` and keeps the Google ID token in memory for \`POST /api/v1/auth/restore\`; declining requires no request.`,
    content: json(PendingDeletionErrorResponse),
  };
  const testSecretRejected = error(
    '`UNAUTHENTICATED`: the `X-Test-Auth-Secret` header is missing or incorrect, or (where required) the bearer token is invalid; the response does not state which.',
  );

  registry.registerPath({
    method: 'get',
    path: '/health',
    tags: ['System'],
    summary: 'Health check',
    responses: {
      200: {
        description: 'The API is running.',
        content: json(z.object({ status: z.literal('ok') })),
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/v1/auth/google',
    tags: ['Auth'],
    operationId: 'signInWithGoogle',
    summary: 'Exchange a Google ID token for a session (UC-01)',
    description: [
      'Verifies the Google ID token and identifies the account by the Google subject identifier, never by email (BR-01). Name, email and avatar are refreshed from the token.',
      `- Active account: 200 with a ${String(SESSION_VALIDITY_DAYS)}-day session.`,
      '- No account for the identifier: the account (status `active`, currency VND) and the 11 default categories are created (FR-02, FR-03, BR-08); 201 with a session.',
      `- Account pending deletion for fewer than ${String(RECOVERY_PERIOD_DAYS)} days: 403 \`ACCOUNT_PENDING_DELETION\`, no session (UC-01 A2).`,
      `- Account pending deletion for ${String(RECOVERY_PERIOD_DAYS)} days or more: the old account and all its data are deleted and a new account is initialised; 201 with a session and no restoration signal (UC-01 A3, BR-15).`,
      '',
      `Rate limit: ${SIGN_IN_LIMIT}`,
      'Neither the Google ID token nor the issued token is logged (NFR-06).',
    ].join('\n'),
    request: { body: { required: true, content: json(GoogleSignInRequest) } },
    responses: {
      200: {
        description: 'Signed in to an existing active account.',
        content: json(SessionResponse),
      },
      201: {
        description:
          'A new account was initialised (first sign-in, or sign-in after the recovery period expired) and signed in.',
        content: json(SessionResponse),
      },
      400: validation,
      401: error(
        '`INVALID_GOOGLE_TOKEN`: the ID token has an invalid signature, has expired, or carries a wrong audience or issuer. The message is generic and does not state which check failed.',
      ),
      403: pendingDeletion,
      429: rateLimited(SIGN_IN_LIMIT),
      500: internal,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/auth/me',
    tags: ['Auth'],
    operationId: 'getCurrentUser',
    summary: 'Profile of the authenticated account (UC-06)',
    description:
      'Returns only the account identified by the token; reads do not modify the account. Also serves as the session check of the web application.',
    security: [{ [bearerAuth.name]: [] }],
    responses: {
      200: { description: 'The profile.', content: json(UserProfile) },
      401: unauthenticated,
      500: internal,
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/api/v1/auth/me',
    tags: ['Auth'],
    operationId: 'requestAccountDeletion',
    summary: 'Request deletion of the authenticated account (UC-03)',
    description: `Sets the status to \`pending_deletion\` and records the request instant (UTC). Every token of the account is rejected with 401 from then on, so the session ends; the client also removes its stored token. The account and its data are permanently deleted ${String(RECOVERY_PERIOD_DAYS)} days later unless restored. No request body.`,
    security: [{ [bearerAuth.name]: [] }],
    responses: {
      204: { description: 'Deletion requested.' },
      401: unauthenticated,
      500: internal,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/v1/auth/restore',
    tags: ['Auth'],
    operationId: 'restoreAccount',
    summary: 'Restore an account pending deletion (UC-04)',
    description: [
      `Verifies the Google ID token exactly as \`POST /api/v1/auth/google\` does. When the account is pending deletion for fewer than ${String(RECOVERY_PERIOD_DAYS)} days, sets its status to \`active\`, clears the request instant, leaves all categories and transactions unchanged, and returns a session (FR-09).`,
      'No bearer token is involved: an account pending deletion never holds a valid session.',
      '',
      'Rate-limited per client IP address with the same windows as `POST /api/v1/auth/google`, counted separately.',
    ].join('\n'),
    request: { body: { required: true, content: json(RestoreAccountRequest) } },
    responses: {
      200: { description: 'Restored and signed in.', content: json(SessionResponse) },
      400: validation,
      401: error(
        '`INVALID_GOOGLE_TOKEN`: the ID token failed verification, typically because it expired while the dialog was open. The client returns to the sign-in screen.',
      ),
      404: error(
        `\`ACCOUNT_NOT_FOUND\`: no account exists for the Google identity, or the recovery period of ${String(RECOVERY_PERIOD_DAYS)} days has expired and the account has been permanently deleted. No session is issued. The client returns the Guest to the sign-in screen; a subsequent \`POST /api/v1/auth/google\` initialises a new account.`,
      ),
      409: error(
        '`ACCOUNT_NOT_PENDING_DELETION`: the account is already active (for example, restored from another tab or device). The account is not modified and no session is issued. The client returns the Guest to the sign-in screen, because the Google ID token held for restoration may have expired; a session is obtained only through a new `POST /api/v1/auth/google`.',
      ),
      429: rateLimited(`${SIGN_IN_LIMIT} Counted separately from \`POST /api/v1/auth/google\`.`),
      500: internal,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/v1/test/auth/token',
    tags: ['test-only'],
    operationId: 'testIssueToken',
    summary: 'Issue a session for a test account (test and staging only)',
    description: [
      TEST_ROUTER_NOTICE,
      '',
      `Creates or reuses the account whose \`googleId\` is \`${TEST_GOOGLE_ID_PREFIX}<userKey>\`, applies the same rules as \`POST /api/v1/auth/google\` (initialisation with the default categories, 403 for an account pending deletion, re-initialisation after the recovery period), and returns a session token identical in form to that of \`POST /api/v1/auth/google\`.`,
    ].join('\n'),
    security: [{ [testAuthSecret.name]: [] }],
    request: { body: { required: true, content: json(TestTokenRequest) } },
    responses: {
      200: { description: 'Existing test account signed in.', content: json(SessionResponse) },
      201: {
        description: 'Test account initialised and signed in.',
        content: json(SessionResponse),
      },
      400: validation,
      401: testSecretRejected,
      403: pendingDeletion,
      404: error('`NOT_FOUND`: the test-only router is not mounted in this environment.'),
      429: rateLimited('at most 600 requests in any 60 minutes per client IP address.'),
      500: internal,
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/api/v1/test/users/me',
    tags: ['test-only'],
    operationId: 'testDeleteCurrentUser',
    summary: 'Permanently delete the authenticated test account (test and staging only)',
    description: [
      TEST_ROUTER_NOTICE,
      '',
      `Immediately and permanently deletes the account identified by the bearer token and all of its categories and transactions, without a recovery period. Accepts the token of a test account in either status, so that a test that requested deletion can still clean up. Refuses any account whose \`googleId\` does not start with \`${TEST_GOOGLE_ID_PREFIX}\`.`,
    ].join('\n'),
    security: [{ [testAuthSecret.name]: [], [bearerAuth.name]: [] }],
    responses: {
      204: { description: 'Deleted.' },
      401: testSecretRejected,
      403: error('`FORBIDDEN`: the account is not a test account; nothing is deleted.'),
      404: error(
        '`NOT_FOUND`: the test-only router is not mounted in this environment, or the account no longer exists.',
      ),
      429: rateLimited('at most 600 requests in any 60 minutes per client IP address.'),
      500: internal,
    },
  });

  return registry;
}

/** Builds the OpenAPI 3.1 document of the API from the Zod schemas (single source of the contract). */
export function buildOpenApiDocument(): ReturnType<OpenApiGeneratorV31['generateDocument']> {
  const generator = new OpenApiGeneratorV31(buildRegistry().definitions);
  return generator.generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'Expense Tracker API',
      version: '1.0.0',
      description:
        'REST API of the Expense Tracker. Every path except `/health` is under `/api/v1`. Errors use `{ "error": { "code", "message", "details" } }`; see `ErrorResponse` for the enumerated codes. Lists use `{ "data": [...], "meta": { "page", "limit", "total" } }`. Sign-out has no endpoint: the client removes the stored token (ADR-0003).',
    },
    tags: [
      { name: 'System', description: 'Operational endpoints.' },
      { name: 'Auth', description: 'Google sign-in, session, profile, deletion and restoration.' },
      {
        name: 'test-only',
        description:
          'Automation support (ADR-0005). Mounted only when APP_ENV is test or staging; these operations do not exist in production.',
      },
    ],
  });
}

/** Serialises the document exactly as committed in `openapi.json`. */
export function serializeOpenApiDocument(): string {
  return `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`;
}
