# expense-tracker-api

REST API of the Expense Tracker: Express, TypeScript (strict), MongoDB with Mongoose, and Zod validation.
Work items are tracked in Jira project `ET`; the architecture and conventions are documented in the
Confluence space `ET`.

## Run locally

Prerequisites: Node.js 22 LTS or later, npm, Docker.

```bash
npm ci                      # installs dependencies
cp .env.example .env        # then set JWT_SECRET and GOOGLE_CLIENT_ID
docker compose up -d        # starts MongoDB on localhost:27017
npm run dev                 # starts the API with reload on http://localhost:3000
curl http://localhost:3000/health   # {"status":"ok"}
```

The process validates its environment variables at start-up and exits with the names of any missing
or invalid variables.

## Environment variables

| Variable           | Required | Default       | Description                                               |
| ------------------ | -------- | ------------- | --------------------------------------------------------- |
| `NODE_ENV`         | No       | `development` | `development`, `test` or `production`                     |
| `PORT`             | No       | `3000`        | HTTP port                                                 |
| `MONGODB_URI`      | Yes      |               | MongoDB connection string                                 |
| `JWT_SECRET`       | Yes      |               | Signing secret for the system JWT, at least 32 characters |
| `JWT_EXPIRES_IN`   | No       | `7d`          | Session validity                                          |
| `CORS_ORIGINS`     | No       | empty         | Comma-separated list of allowed web origins               |
| `GOOGLE_CLIENT_ID` | Yes      |               | OAuth client ID used to verify Google ID tokens           |

`.env` is never committed. Deployed environments receive these values from Azure App Settings.

## Scripts

| Script                            | Purpose                                         |
| --------------------------------- | ----------------------------------------------- |
| `npm run dev`                     | Development server with reload (tsx)            |
| `npm run build` / `npm start`     | Compiles to `dist/` / runs the compiled server  |
| `npm run lint` / `npm run format` | ESLint / Prettier                               |
| `npm run typecheck`               | TypeScript type check                           |
| `npm test`                        | Unit and integration tests (Vitest, Supertest)  |
| `npm run test:coverage`           | Tests with coverage; fails below 70%            |
| `npm run openapi:generate`        | Regenerates `openapi.json` from the Zod schemas |

## API contract

`openapi.json` (OpenAPI 3.1) is generated from the Zod schemas in `src/schemas/` by
`src/openapi/document.ts` and is committed so that the web application can generate its types
(`npm run gen:api`, openapi-typescript). After any schema change, run `npm run openapi:generate` and
commit the result; a unit test fails when the committed file differs from the generated document.

| Method | Path                      | Auth                   | Success                       | Errors                       |
| ------ | ------------------------- | ---------------------- | ----------------------------- | ---------------------------- |
| GET    | `/health`                 | None                   | `200 { "status": "ok" }`      |                              |
| POST   | `/api/v1/auth/google`     | None (Google ID token) | `200`/`201` `SessionResponse` | 400, 401, 403, 429, 500      |
| GET    | `/api/v1/auth/me`         | Bearer                 | `200` `UserProfile`           | 401, 500                     |
| DELETE | `/api/v1/auth/me`         | Bearer                 | `204`                         | 401, 500                     |
| POST   | `/api/v1/auth/restore`    | None (Google ID token) | `200` `SessionResponse`       | 400, 401, 404, 409, 429, 500 |
| POST   | `/api/v1/test/auth/token` | `X-Test-Auth-Secret`   | `200`/`201` `SessionResponse` | 400, 401, 403, 404, 429, 500 |
| DELETE | `/api/v1/test/users/me`   | Secret and Bearer      | `204`                         | 401, 403, 404, 429, 500      |

The `/api/v1/test` routes (tag `test-only`, ADR-0005) are mounted only when `APP_ENV` is `test` or
`staging`; they do not exist in production. The system JWT is valid for 7 days and has no refresh
token; sign-out is a client-side action. An account pending deletion receives
`403 ACCOUNT_PENDING_DELETION` from sign-in, with `details[0].remainingDays` rounded down.

Errors use the format `{ "error": { "code", "message", "details" } }`, with the codes enumerated in
the `ErrorResponse` schema. Business errors are raised as `AppError(code, status, message)` and
rendered by the central error handler; unknown routes return `404 NOT_FOUND`, and unexpected errors
return `500 INTERNAL_ERROR` without internal detail.

## Structure

`src/app.ts` builds the Express application without listening (used by Supertest); `src/server.ts`
loads the environment, connects to MongoDB and listens. Code is layered under `src/` as `routes/`,
`controllers/`, `services/`, `models/`, `middlewares/`, `schemas/`, `config/` and `utils/`; tests
live under `tests/integration/`, `tests/unit/` and `tests/helpers/`.

## Contributing

- `npm ci` installs the Git hooks (Husky). The `pre-commit` hook lints and formats staged files
  (lint-staged); the `commit-msg` hook rejects messages that are not Conventional Commits (commitlint).
- Branch: `<feat|fix|chore|docs|test>/ET-<n>-<short-description>`.
- Commits and PR titles: Conventional Commits containing the Jira key, for example
  `feat(transactions): ET-12 record transaction`. Squash merge only, through a Pull Request.
