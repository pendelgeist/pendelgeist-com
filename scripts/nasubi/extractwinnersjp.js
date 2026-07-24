import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, 'source');

const raw = fs.readFileSync(path.join(SRC, 'nasubi-entries.md'), 'utf-8');
const lines = raw.split('\n');
for (const line of lines) {
  const t = line.trim();
  if (!t.startsWith('|') || t.includes('---') || t.includes('Entry Month') || t.includes('日本語')) continue;
  const parts = t.split('|').map(p => p.trim()).filter(p => p);
  if (parts.length >= 5 && parts[4].trim().length > 0) {
    const jp = parts[0];
    const en = parts[1];
    const jpy = parts.length > 5 ? parts[5] : '';
    console.log(jp + ' | ' + en + ' | ' + jpy);
  }
}
