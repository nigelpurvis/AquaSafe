import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import app from '../server/src/app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '..', 'server', '.env') });

export default app;
