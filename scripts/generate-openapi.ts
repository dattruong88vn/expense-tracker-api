/**
 * Writes `openapi.json` at the repository root from the Zod schemas.
 * Run with `npm run openapi:generate`; the web application consumes the committed file (`gen:api`).
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serializeOpenApiDocument } from '../src/openapi/document.js';

const target = fileURLToPath(new URL('../openapi.json', import.meta.url));

writeFileSync(target, serializeOpenApiDocument());
process.stdout.write(`Wrote ${target}\n`);
