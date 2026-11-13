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

| Script                            | Purpose                                        |
| --------------------------------- | ---------------------------------------------- |
| `npm run dev`                     | Development server with reload (tsx)           |
| `npm run build` / `npm start`     | Compiles to `dist/` / runs the compiled server |
| `npm run lint` / `npm run format` | ESLint / Prettier                              |
| `npm run typecheck`               | TypeScript type check                          |
| `npm test`                        | Unit and integration tests (Vitest, Supertest) |
| `npm run test:coverage`           | Tests with coverage; fails below 70%           |

## Endpoints

| Method | Path      | Response                 |
| ------ | --------- | ------------------------ |
| GET    | `/health` | `200 { "status": "ok" }` |

## Structure

`src/app.ts` builds the Express application without listening (used by Supertest); `src/server.ts`
loads the environment, connects to MongoDB and listens. Code is layered under `src/` as `routes/`,
`controllers/`, `services/`, `models/`, `middlewares/`, `schemas/`, `config/` and `utils/`; tests
live under `tests/integration/`, `tests/unit/` and `tests/helpers/`.
