// Stores the .glb models of the single-file build as base64 text (.glb.txt), for hosts that only
// serve common web file types. src/world/humans.ts (loadModel) decodes them again.
import { readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? 'dist-single/assets';
for (const f of readdirSync(dir).filter((n) => n.endsWith('.glb'))) {
  writeFileSync(join(dir, f + '.txt'), readFileSync(join(dir, f)).toString('base64'));
  rmSync(join(dir, f));
  console.log('encoded', f);
}
