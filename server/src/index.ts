import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '..', '.env') });
import app from './app.js';
const PORT = process.env.PORT ?? 5001;

app.listen(PORT, () => {
  console.log(`AquaSafe API running at http://localhost:${PORT}`);
});
