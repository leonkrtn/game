import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const matKeys = new WeakMap<THREE.Material, string>();

/** Materials with identical settings get the same key, so separately created twins can merge. */
function materialKey(m: THREE.Material): string {
  let k = matKeys.get(m);
  if (k) return k;
  // Shader and canvas-screen materials are animated per object: they keep their identity.
  if ((m as THREE.ShaderMaterial).isShaderMaterial || Object.values(m).some((v) => v instanceof THREE.CanvasTexture)) {
    k = m.uuid;
  } else {
    const json = m.toJSON() as unknown as Record<string, unknown>;
    delete json.uuid;
    delete json.name;
    delete json.metadata;
    k = JSON.stringify(json, (key, v) => (key === 'textures' || key === 'images' ? undefined : v));
  }
  matKeys.set(m, k);
  return k;
}

/**
 * Merges static meshes under `roots` that share a material into one mesh each, placed in `target`
 * (default: the scene). The GPU then gets a few draw calls instead of hundreds, and the picture is
 * exactly the same. Anything under `keep` (moving or animated parts) stays as it is.
 */
export function mergeStatic(roots: THREE.Object3D[], keep: THREE.Object3D[] = [], target?: THREE.Object3D): number {
  const skip = new Set<THREE.Object3D>();
  for (const k of keep) k.traverse((o) => skip.add(o));
  const into = target ?? roots[0]?.parent;
  if (!into) return 0;
  into.updateMatrixWorld(true);
  const toTarget = new THREE.Matrix4().copy(into.matrixWorld).invert();
  const groups = new Map<string, { mat: THREE.Material; cast: boolean; receive: boolean; order: number; items: THREE.Mesh[] }>();
  for (const root of roots) {
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || skip.has(m) || (m as unknown as THREE.InstancedMesh).isInstancedMesh || (m as unknown as THREE.SkinnedMesh).isSkinnedMesh) return;
      if (Array.isArray(m.material) || !m.visible || m.userData.itemUid !== undefined) return;
      const g = m.geometry;
      const attrs = Object.keys(g.attributes).sort().join(',');
      const key = `${materialKey(m.material)}|${m.castShadow}|${m.receiveShadow}|${g.index ? 'i' : 'n'}|${attrs}|${m.renderOrder}`;
      let e = groups.get(key);
      if (!e) groups.set(key, (e = { mat: m.material, cast: m.castShadow, receive: m.receiveShadow, order: m.renderOrder, items: [] }));
      e.items.push(m);
    });
  }
  let removed = 0;
  const rel = new THREE.Matrix4();
  for (const e of groups.values()) {
    if (e.items.length < 2) continue;
    const geos = e.items.map((m) => m.geometry.clone().applyMatrix4(rel.multiplyMatrices(toTarget, m.matrixWorld)));
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, e.mat);
    mesh.castShadow = e.cast;
    mesh.receiveShadow = e.receive;
    mesh.renderOrder = e.order;
    into.add(mesh);
    for (const m of e.items) m.parent?.remove(m);
    removed += e.items.length - 1;
  }
  return removed;
}
