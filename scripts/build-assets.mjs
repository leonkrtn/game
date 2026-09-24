// Downloads the third-party models used by the game and shrinks them for the web.
// Run with `node scripts/build-assets.mjs`; results go to public/assets/.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, textureCompress, weld } from '@gltf-transform/functions';
import sharp from 'sharp';
import { mkdir, writeFile, stat } from 'node:fs/promises';

const THREE_EX = 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples';
const KHRONOS = 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models';

const MODELS = [
  { out: 'man.glb', url: `${THREE_EX}/models/gltf/readyplayer.me.glb`, size: 1024, webp: true },
  { out: 'anims.glb', url: `${THREE_EX}/models/gltf/Xbot.glb`, size: 256, stripMeshes: true },
  { out: 'chair.glb', url: `${KHRONOS}/ChairDamaskPurplegold/glTF-Binary/ChairDamaskPurplegold.glb`, size: 512 },
  { out: 'sunglasses.glb', url: `${KHRONOS}/SunglassesKhronos/glTF-Binary/SunglassesKhronos.glb`, size: 512, webp: true },
  { out: 'candle.glb', url: `${KHRONOS}/GlassHurricaneCandleHolder/glTF-Binary/GlassHurricaneCandleHolder.glb`, size: 512 },
];

const TEXTURES = [
  { out: 'wood_diffuse.jpg', url: `${THREE_EX}/textures/hardwood2_diffuse.jpg` },
  { out: 'wood_bump.jpg', url: `${THREE_EX}/textures/hardwood2_bump.jpg` },
  { out: 'wood_roughness.jpg', url: `${THREE_EX}/textures/hardwood2_roughness.jpg` },
];

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
await mkdir('public/assets', { recursive: true });

async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

for (const m of MODELS) {
  const doc = await io.readBinary(await fetchBytes(m.url));
  if (m.stripMeshes) {
    // Keep the skeleton and animation clips; a tiny proxy stays so the joints remain bones.
    for (const mesh of doc.getRoot().listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        const pos = prim.getAttribute('POSITION');
        if (pos && pos.getCount() > 3) {
          for (const sem of prim.listSemantics()) {
            const acc = prim.getAttribute(sem);
            const size = acc.getElementSize();
            acc.setArray(acc.getArray().slice(0, 3 * size));
          }
          const idx = prim.getIndices();
          if (idx) idx.setArray(new Uint16Array([0, 1, 2]));
        }
      }
    }
  }
  await doc.transform(
    dedup(),
    weld(),
    textureCompress({ encoder: sharp, ...(m.webp ? { targetFormat: 'webp' } : {}), resize: [m.size, m.size] }),
    prune(),
  );
  const bytes = await io.writeBinary(doc);
  const dir = m.stripMeshes ? 'assets-src' : 'public/assets';
  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}/${m.out}`, bytes);
  console.log(`${m.out}: ${(bytes.length / 1024).toFixed(0)} KB`);
}

for (const t of TEXTURES) {
  const buf = await sharp(Buffer.from(await fetchBytes(t.url))).resize(1024, 1024, { fit: 'inside' }).jpeg({ quality: 82 }).toBuffer();
  await writeFile(`public/assets/${t.out}`, buf);
  console.log(`${t.out}: ${((await stat(`public/assets/${t.out}`)).size / 1024).toFixed(0)} KB`);
}
