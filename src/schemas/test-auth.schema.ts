import { z } from 'zod';

/** Reserved `googleId` prefix of test accounts; Google never produces it (ADR-0005). */
export const TEST_GOOGLE_ID_PREFIX = 'test|';

export const testTokenRequestSchema = z
  .strictObject({
    userKey: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,64}$/)
      .meta({
        description: `Caller-chosen key of the test account; the account's \`googleId\` is \`${TEST_GOOGLE_ID_PREFIX}<userKey>\`. The same key reuses the same account.`,
        example: 'api-01-run-4711',
      }),
    name: z.string().trim().min(1).max(100).optional().meta({
      description:
        'Display name. Defaults to `Test User <userKey>` on creation; when supplied for an existing account it overwrites the stored name, as a Google sign-in does.',
      example: 'An Nguyen',
    }),
    email: z.email().optional().meta({
      description:
        'Email. Defaults to `<userKey>@test.invalid` on creation; when supplied for an existing account it overwrites the stored email.',
      example: 'an.nguyen@example.com',
    }),
  })
  .meta({
    id: 'TestTokenRequest',
    description: 'Body of `POST /api/v1/test/auth/token`. Unknown properties are rejected.',
  });

export type TestTokenRequest = z.infer<typeof testTokenRequestSchema>;
