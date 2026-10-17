// CI gate: every rate card in packages/engine/src/rate-card must pass RateCardSchema
// and have a version matching its filename. Prints every unpriced (null) field so the
// gaps are visible in the CI log. Run: npm run validate:rate-card
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { RateCardSchema } from '../packages/engine/src/schemas.js';

const dir = fileURLToPath(new URL('../packages/engine/src/rate-card/', import.meta.url));
let failed = false;

for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  const json = JSON.parse(readFileSync(join(dir, file), 'utf8'));
  const result = RateCardSchema.safeParse(json);
  const expectedVersion = file.replace(/^rate-card\./, '').replace(/\.json$/, '');
  if (!result.success) {
    failed = true;
    console.error(`✗ ${file}: schema errors`);
    for (const issue of result.error.issues) console.error(`   ${issue.path.join('.')}: ${issue.message}`);
    continue;
  }
  if (json.version !== expectedVersion) {
    failed = true;
    console.error(`✗ ${file}: version "${json.version}" does not match filename`);
    continue;
  }
  const nulls: string[] = [];
  const walk = (o: Record<string, unknown>, p = '') => {
    for (const [k, v] of Object.entries(o)) {
      if (v === null) nulls.push(p + k);
      else if (v && typeof v === 'object' && !Array.isArray(v)) walk(v as Record<string, unknown>, `${p}${k}.`);
    }
  };
  walk(json.meters);
  console.log(`✓ ${file} — version ${json.version}, ${nulls.length} unpriced field(s)`);
  for (const n of nulls) console.log(`   unpriced: ${n}`);
}
process.exit(failed ? 1 : 0);
