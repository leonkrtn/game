// Converts the .glb models of the single-file build into self-contained glTF JSON (.gltf.json),
// for hosts that only serve common web file types.
import { readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const dir = process.argv[2] ?? 'dist-single/assets';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const dataUri = (mime, bytes) => `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;

for (const f of readdirSync(dir).filter((n) => n.endsWith('.glb'))) {
  const doc = await io.readBinary(new Uint8Array(readFileSync(join(dir, f))));
  const { json, resources } = await io.writeJSON(doc, { format: 'gltf', basename: f.replace('.glb', '') });
  for (const b of json.buffers ?? []) if (b.uri) b.uri = dataUri('application/octet-stream', resources[b.uri]);
  for (const im of json.images ?? []) if (im.uri) im.uri = dataUri(im.mimeType ?? 'image/png', resources[im.uri]);
  writeFileSync(join(dir, f.replace('.glb', '.gltf.json')), JSON.stringify(json));
  rmSync(join(dir, f));
  console.log('embedded', f);
}
