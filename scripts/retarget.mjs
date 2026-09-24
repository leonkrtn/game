// Retargets the Mixamo clips of anims.glb onto the man and woman models once, offline, and writes
// compact JSON clips to public/assets/. Run after build-assets: `node scripts/retarget.mjs`.
//
// The skeletons differ in rest pose (T-pose vs A-pose) and bone axes, so copying rotations directly
// breaks limbs. Instead: (1) bend the target into the source's T-pose by matching bone directions,
// (2) store a per-bone rotation offset between the two T-poses, (3) per frame, target world
// rotation = source world rotation × offset.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { writeFile } from 'node:fs/promises';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

/** Loads a glb without its textures (Node has no image decoding). */
async function load(file) {
  const doc = await io.read(file);
  for (const t of doc.getRoot().listTextures()) t.dispose();
  const bytes = await io.writeBinary(doc);
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Promise((res, rej) => new GLTFLoader().parse(buf, '', res, rej));
}

const CLIPS = ['idle', 'walk', 'run', 'headShake', 'agree', 'sad_pose'];
const FPS = 30;
const CHAIN = ['Spine', 'Neck', 'Head', 'HeadTop_End', 'Middle1', 'Index1'];

function bonesOf(scene) {
  const map = new Map();
  scene.traverse((o) => o.isBone && map.set(o.name, o));
  return map;
}

const worldQuat = (o) => o.getWorldQuaternion(new THREE.Quaternion());
const worldPos = (o) => o.getWorldPosition(new THREE.Vector3());

/** Child bone that continues the limb, used to measure a bone's direction. */
function chainChild(bone, isMapped) {
  const kids = bone.children.filter((c) => c.isBone && isMapped(c));
  if (!kids.length) return undefined;
  for (const key of CHAIN) {
    const k = kids.find((c) => c.name.endsWith(key));
    if (k) return k;
  }
  return kids[0];
}

/** Sets a bone's world rotation, keeping its parent. */
function setWorldQuat(bone, q) {
  const parent = worldQuat(bone.parent);
  bone.quaternion.copy(parent.invert().multiply(q));
  bone.updateMatrixWorld(true);
}

const anims = await load('assets-src/anims.glb');
const src = bonesOf(anims.scene);
anims.scene.updateMatrixWorld(true);
// Source rest pose (T-pose) directions and rotations.
const srcRest = new Map();
for (const [name, b] of src) srcRest.set(name, { q: worldQuat(b), p: worldPos(b) });
const srcHips = src.get('mixamorigHips');
const srcHipY = worldPos(srcHips).y;

for (const kind of ['man']) {
  const gltf = await load(`public/assets/${kind}.glb`);
  const tgt = bonesOf(gltf.scene);
  const srcName = (n) => (kind === 'man' ? 'mixamorig' + n : n);
  const isMapped = (b) => src.has(srcName(b.name));
  gltf.scene.updateMatrixWorld(true);
  const order = [];
  gltf.scene.traverse((o) => o.isBone && isMapped(o) && order.push(o));
  const restLocal = new Map(order.map((b) => [b.name, b.quaternion.clone()]));
  const hips = order.find((b) => b.name.endsWith('Hips'));
  const tgtHipY = worldPos(hips).y;

  // 1. Bend the target into the source T-pose, parents first.
  for (const b of order) {
    const child = chainChild(b, isMapped);
    const sb = src.get(srcName(b.name));
    const sc = child && src.get(srcName(child.name));
    if (!child || !sc) continue;
    const want = srcRest.get(sc.name).p.clone().sub(srcRest.get(sb.name).p).normalize();
    const have = worldPos(child).sub(worldPos(b)).normalize();
    const swing = new THREE.Quaternion().setFromUnitVectors(have, want);
    setWorldQuat(b, swing.multiply(worldQuat(b)));
  }
  // 2. Offsets between the two T-poses.
  const offset = new Map();
  for (const b of order) offset.set(b.name, srcRest.get(srcName(b.name)).q.clone().invert().multiply(worldQuat(b)));

  const out = [];
  for (const name of CLIPS) {
    const clip = anims.animations.find((c) => c.name === name);
    if (!clip) continue;
    const mixer = new THREE.AnimationMixer(anims.scene);
    const action = mixer.clipAction(clip);
    action.play();
    const frames = Math.max(2, Math.round(clip.duration * FPS) + 1);
    const times = new Float32Array(frames);
    const quats = new Map(order.map((b) => [b.name, new Float32Array(frames * 4)]));
    const hipPos = new Float32Array(frames * 3);
    for (let f = 0; f < frames; f++) {
      const t = Math.min(clip.duration, f / FPS);
      times[f] = t;
      mixer.setTime(t);
      anims.scene.updateMatrixWorld(true);
      for (const b of order) {
        const sb = src.get(srcName(b.name));
        const q = worldQuat(sb).multiply(offset.get(b.name));
        setWorldQuat(b, q);
        b.quaternion.toArray(quats.get(b.name), f * 4);
      }
      // Hips height follows the source, scaled to the target's leg length; no travel in x/z.
      const sy = worldPos(srcHips).y;
      const wp = worldPos(hips);
      wp.y = tgtHipY + (sy - srcHipY) * (tgtHipY / srcHipY);
      const local = hips.parent.worldToLocal(wp.clone());
      const restP = hips.position.clone();
      local.x = restP.x;
      local.z = restP.z;
      local.toArray(hipPos, f * 3);
    }
    // Put the target back to its rest pose for the next clip.
    for (const b of order) b.quaternion.copy(restLocal.get(b.name));
    gltf.scene.updateMatrixWorld(true);
    const round = (a) => Float32Array.from(a, (x) => Math.round(x * 1e4) / 1e4);
    const tracks = order.map((b) => new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`, times, round(quats.get(b.name))));
    tracks.push(new THREE.VectorKeyframeTrack(`${hips.name}.position`, times, round(hipPos)));
    const result = new THREE.AnimationClip(name, clip.duration, tracks);
    out.push(THREE.AnimationClip.toJSON(result));
  }
  const text = JSON.stringify(out);
  await writeFile(`public/assets/clips-${kind}.json`, text);
  console.log(`clips-${kind}.json ${(text.length / 1024).toFixed(0)} KB, ${order.length} bones`);
}
