import { z } from 'zod';
import { instantSchema, objectIdSchema } from './common.schema.js';

/** Length of the recovery period after a deletion request (BR-14). */
export const RECOVERY_PERIOD_DAYS = 30;

/** Validity of a system session token from its issuance (FR-05, ADR-0003). */
export const SESSION_VALIDITY_DAYS = 7;

export const googleIdTokenSchema = z.string().min(1).max(4096).meta({
  description:
    'Google ID token (JWT) obtained by the web application from Google Identity Services. Verified on the server (signature, expiry, audience equal to `GOOGLE_CLIENT_ID`, Google issuer); never logged.',
  example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6Ij...',
});

export const googleSignInRequestSchema = z.strictObject({ idToken: googleIdTokenSchema }).meta({
  id: 'GoogleSignInRequest',
  description: 'Body of `POST /api/v1/auth/google`. Unknown properties are rejected.',
});

export const restoreAccountRequestSchema = z.strictObject({ idToken: googleIdTokenSchema }).meta({
  id: 'RestoreAccountRequest',
  description:
    'Body of `POST /api/v1/auth/restore`: the Google ID token that was presented to `POST /api/v1/auth/google` and answered with `ACCOUNT_PENDING_DELETION`, re-sent while it is unexpired. Unknown properties are rejected.',
});

export const accountStatusSchema = z.enum(['active', 'pending_deletion']).meta({
  id: 'AccountStatus',
  description: 'Account status. Every successful response carries `active`.',
  example: 'active',
});

export const userProfileSchema = z
  .object({
    id: objectIdSchema,
    email: z.email().meta({
      description: 'Email obtained from Google; for display only.',
      example: 'an.nguyen@example.com',
    }),
    name: z.string().meta({
      description: 'Display name obtained from Google, refreshed at each sign-in.',
      example: 'An Nguyen',
    }),
    avatarUrl: z.url().nullable().meta({
      description: 'Avatar URL obtained from Google, or `null` when Google provides none.',
      example: 'https://lh3.googleusercontent.com/a/example',
    }),
    currency: z.literal('VND').meta({ description: 'Account currency (BR-02).' }),
    status: accountStatusSchema,
    createdAt: instantSchema,
  })
  .meta({
    id: 'UserProfile',
    description: 'Profile of the authenticated account (FR-11).',
  });

export const sessionResponseSchema = z
  .object({
    token: z.string().meta({
      description: `System session token: an HS256-signed JWT whose claims are limited to \`sub\` (the account \`id\`), \`iat\` and \`exp\`. It is valid for ${String(SESSION_VALIDITY_DAYS)} days from issuance, there is no refresh token, and it is sent as \`Authorization: Bearer <token>\`.`,
      example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    }),
    tokenType: z.literal('Bearer'),
    expiresAt: instantSchema.meta({
      description: `Expiry of the token (its \`exp\` claim): issuance plus ${String(SESSION_VALIDITY_DAYS)} days.`,
      example: '2026-11-08T01:00:00.000Z',
    }),
    user: userProfileSchema,
  })
  .meta({
    id: 'SessionResponse',
    description: 'A new session for an active account.',
  });

export const pendingDeletionDetailSchema = z
  .object({
    remainingDays: z
      .number()
      .int()
      .min(0)
      .max(RECOVERY_PERIOD_DAYS)
      .meta({
        description: `Whole days remaining before permanent deletion, rounded down: floor((deletionRequestedAt + ${String(RECOVERY_PERIOD_DAYS)} days - now) / 24 h). The value 0 means that less than one day remains.`,
        example: 8,
      }),
    deletionRequestedAt: instantSchema,
    permanentDeletionAt: instantSchema.meta({
      description: `deletionRequestedAt plus ${String(RECOVERY_PERIOD_DAYS)} days; from this instant the account is treated as permanently deleted.`,
      example: '2026-12-01T03:00:00.000Z',
    }),
  })
  .meta({
    id: 'PendingDeletionDetail',
    description: 'Remaining recovery time of an account pending deletion (UC-04).',
  });

export const pendingDeletionErrorResponseSchema = z
  .object({
    error: z.object({
      code: z.literal('ACCOUNT_PENDING_DELETION'),
      message: z.string().meta({ example: 'The account is pending deletion' }),
      details: z.array(pendingDeletionDetailSchema).min(1).max(1),
    }),
  })
  .meta({
    id: 'PendingDeletionErrorResponse',
    description:
      'Signals an account pending deletion within the recovery period (UC-01 A2). No session is issued and no account data is returned.',
  });

export type GoogleSignInRequest = z.infer<typeof googleSignInRequestSchema>;
export type RestoreAccountRequest = z.infer<typeof restoreAccountRequestSchema>;
export type UserProfile = z.infer<typeof userProfileSchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
export type PendingDeletionDetail = z.infer<typeof pendingDeletionDetailSchema>;
