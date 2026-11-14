import { z } from 'zod';

/**
 * Stable, machine-readable error codes of the standard error format.
 * The HTTP status of each code is fixed; clients branch on `error.code`, never on `error.message`.
 */
export const errorCodes = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'INVALID_GOOGLE_TOKEN',
  'FORBIDDEN',
  'ACCOUNT_PENDING_DELETION',
  'NOT_FOUND',
  'ACCOUNT_NOT_FOUND',
  'ACCOUNT_NOT_PENDING_DELETION',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof errorCodes)[number];

/** HTTP status associated with each error code. */
export const errorCodeStatus: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  INVALID_GOOGLE_TOKEN: 401,
  FORBIDDEN: 403,
  ACCOUNT_PENDING_DELETION: 403,
  NOT_FOUND: 404,
  ACCOUNT_NOT_FOUND: 404,
  ACCOUNT_NOT_PENDING_DELETION: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

export const errorCodeSchema = z.enum(errorCodes).meta({
  description: [
    'Stable error code. Status and meaning:',
    '- `VALIDATION_ERROR` (400): the body, query, parameters or headers failed validation; `details` lists the issues.',
    '- `UNAUTHENTICATED` (401): the bearer token is missing, malformed, altered or expired, or its account no longer exists or is pending deletion; on the test-only router, the `X-Test-Auth-Secret` header is missing or incorrect.',
    '- `INVALID_GOOGLE_TOKEN` (401): the Google ID token failed verification (signature, expiry, audience or issuer); the message never states which check failed.',
    '- `FORBIDDEN` (403): the authenticated account may not perform the operation (test-only router: the account is not a test account).',
    '- `ACCOUNT_PENDING_DELETION` (403): the Google identity belongs to an account pending deletion within the recovery period; no session is issued and `details[0]` carries the remaining time.',
    '- `NOT_FOUND` (404): the path does not exist (including the test-only router where it is not mounted).',
    '- `ACCOUNT_NOT_FOUND` (404): no restorable account exists for the Google identity (none exists, or the recovery period has expired).',
    '- `ACCOUNT_NOT_PENDING_DELETION` (409): restoration was requested for an account that is active.',
    '- `RATE_LIMITED` (429): the per-IP request limit of the endpoint is exhausted; see the `Retry-After` header.',
    '- `INTERNAL_ERROR` (500): unexpected server error; no internal detail is disclosed.',
  ].join('\n'),
  example: 'VALIDATION_ERROR',
});

const errorDetailSchema = z.record(z.string(), z.unknown()).meta({
  id: 'ErrorCode',
  description: 'Structured detail of the error; its shape depends on `code`.',
});

export const errorResponseSchema = z
  .object({
    error: z.object({
      code: errorCodeSchema,
      message: z.string().meta({
        description: 'Human-readable English description, for logs and diagnostics only.',
        example: 'Authentication required',
      }),
      details: z.array(errorDetailSchema).meta({
        description:
          'Empty for every code except `VALIDATION_ERROR` and `ACCOUNT_PENDING_DELETION`.',
      }),
    }),
  })
  .meta({
    id: 'ErrorResponse',
    description: 'Standard error format of every non-2xx response.',
  });

export const validationIssueSchema = z
  .object({
    path: z.string().meta({
      description:
        'Dot-separated location of the invalid value, prefixed by its source (`body`, `query`, `params` or `headers`).',
      example: 'body.idToken',
    }),
    message: z.string().meta({ example: 'Required' }),
  })
  .meta({
    id: 'ValidationIssue',
    description: 'A single validation issue.',
  });

export const validationErrorResponseSchema = z
  .object({
    error: z.object({
      code: z.literal('VALIDATION_ERROR'),
      message: z.string().meta({ example: 'Request validation failed' }),
      details: z.array(validationIssueSchema).min(1),
    }),
  })
  .meta({
    id: 'ValidationErrorResponse',
    description: 'Standard error format for status 400.',
  });

export const objectIdSchema = z
  .string()
  .regex(/^[a-f0-9]{24}$/)
  .meta({
    description: 'Identifier (24 hexadecimal characters).',
    example: '6750a1b2c3d4e5f6a7b8c9d0',
  });

export const instantSchema = z.iso
  .datetime()
  .meta({ description: 'UTC instant in ISO 8601 format.', example: '2026-11-01T03:00:00.000Z' });
