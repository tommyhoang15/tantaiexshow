import { LoadingManager } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// Shared GLTF loader with meshopt decoding (no external wasm/Draco files needed).
// Progress is reported in bytes so the loading bar is honest.
export function createLoader(onProgress) {
  const loaded = new Map();
  const totals = new Map();
  const manager = new LoadingManager();
  const loader = new GLTFLoader(manager);
  loader.setMeshoptDecoder(MeshoptDecoder);

  const report = () => {
    let a = 0, b = 0;
    totals.forEach((t, url) => { b += t; a += loaded.get(url) ?? 0; });
    onProgress?.(b ? a / b : 0);
  };

  return {
    gltf(url, sizeHint = 1) {
      totals.set(url, sizeHint);
      return new Promise((resolve, reject) => {
        loader.load(url, (g) => { loaded.set(url, totals.get(url)); report(); resolve(g); }, (e) => {
          if (e.lengthComputable) totals.set(url, e.total);
          loaded.set(url, e.loaded);
          report();
        }, reject);
      });
    },
    async json(url) { const r = await fetch(url); return r.json(); },
  };
}
