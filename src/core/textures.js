import * as THREE from 'three';

// Procedural textures drawn on canvases at startup: zero bytes to download.
const rnd = (() => { let s = 1234567; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();

function make(size, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function speckle(g, s, n, a) {
  for (let i = 0; i < n; i++) {
    const v = Math.floor(rnd() * 255);
    g.fillStyle = `rgba(${v},${v},${v},${a * rnd()})`;
    g.fillRect(rnd() * s, rnd() * s, 1 + rnd() * 2, 1 + rnd() * 2);
  }
}

// Dark blue-grey dungeon stone blocks with recessed mortar
export function stoneBricks() {
  return make(512, (g, s) => {
    g.fillStyle = '#0d0f12'; g.fillRect(0, 0, s, s);
    const rows = 8, cols = 4, bh = s / rows, bw = s / cols;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * bw / 2;
      for (let c = -1; c <= cols; c++) {
        const x = c * bw + off, y = r * bh;
        const l = 30 + rnd() * 22;
        g.fillStyle = `hsl(${210 + rnd() * 20}, ${8 + rnd() * 8}%, ${l * 0.5}%)`;
        g.fillRect(x + 3, y + 3, bw - 6, bh - 6);
        // bevel highlight / shadow
        g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(x + 3, y + 3, bw - 6, 3);
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 3, y + bh - 6, bw - 6, 3);
        if (rnd() < 0.25) { // crack
          g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1;
          g.beginPath(); let px = x + rnd() * bw, py = y + 4; g.moveTo(px, py);
          for (let k = 0; k < 4; k++) { px += (rnd() - 0.5) * 18; py += bh / 5; g.lineTo(px, py); }
          g.stroke();
        }
      }
    }
    speckle(g, s, 6000, 0.12);
  });
}

// Irregular slate flagstones for the floor
export function flagstones() {
  return make(512, (g, s) => {
    g.fillStyle = '#07080a'; g.fillRect(0, 0, s, s);
    const n = 4, cell = s / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const sub = rnd() < 0.4 ? 2 : 1;
      for (let a = 0; a < sub; a++) for (let b = 0; b < sub; b++) {
        const w = cell / sub, x = i * cell + a * w, y = j * cell + b * w;
        g.fillStyle = `hsl(${205 + rnd() * 25}, 10%, ${12 + rnd() * 9}%)`;
        g.beginPath();
        g.moveTo(x + 3 + rnd() * 3, y + 3 + rnd() * 3);
        g.lineTo(x + w - 3 - rnd() * 3, y + 3 + rnd() * 3);
        g.lineTo(x + w - 3 - rnd() * 3, y + w - 3 - rnd() * 3);
        g.lineTo(x + 3 + rnd() * 3, y + w - 3 - rnd() * 3);
        g.fill();
      }
    }
    speckle(g, s, 9000, 0.1);
  });
}

export function woodPlanks() {
  return make(256, (g, s) => {
    for (let i = 0; i < 4; i++) {
      g.fillStyle = `hsl(${22 + rnd() * 8}, ${45 + rnd() * 10}%, ${14 + rnd() * 6}%)`;
      g.fillRect(i * s / 4, 0, s / 4 - 2, s);
      for (let k = 0; k < 14; k++) {
        g.strokeStyle = `rgba(0,0,0,${0.1 + rnd() * 0.2})`;
        g.beginPath(); const x = i * s / 4 + rnd() * s / 4; g.moveTo(x, 0);
        g.bezierCurveTo(x + 4, s / 3, x - 4, (2 * s) / 3, x + (rnd() - 0.5) * 6, s); g.stroke();
      }
    }
  });
}

// Cracked ice slab (crystal plinths in the event)
export function ice() {
  return make(512, (g, s) => {
    const grd = g.createLinearGradient(0, 0, s, s);
    grd.addColorStop(0, '#0a3c8a'); grd.addColorStop(0.5, '#1d6fd6'); grd.addColorStop(1, '#0b2f73');
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 70; i++) {
      g.strokeStyle = `rgba(200,235,255,${0.15 + rnd() * 0.5})`;
      g.lineWidth = 0.5 + rnd() * 1.5;
      g.beginPath(); let x = rnd() * s, y = rnd() * s; g.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += (rnd() - 0.5) * 90; y += (rnd() - 0.5) * 90; g.lineTo(x, y); }
      g.stroke();
    }
    speckle(g, s, 4000, 0.25);
  });
}

// Patch a MeshStandardMaterial to sample `tex` with world-space triplanar mapping,
// so textures look right whatever UVs the source model shipped with.
export function triplanar(material, tex, scale = 0.5) {
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uTri = { value: tex };
    sh.uniforms.uTriScale = { value: scale };
    sh.vertexShader = 'varying vec3 vTriPos;\nvarying vec3 vTriNrm;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vec4 triP = vec4(transformed, 1.0);
      vec3 triN = objectNormal;
      #ifdef USE_INSTANCING
        triP = instanceMatrix * triP;
        triN = mat3(instanceMatrix) * triN;
      #endif
      vTriPos = (modelMatrix * triP).xyz;
      vTriNrm = mat3(modelMatrix) * triN; // normalised (safely) in the fragment shader`
    );
    sh.fragmentShader = 'uniform sampler2D uTri;\nuniform float uTriScale;\nvarying vec3 vTriPos;\nvarying vec3 vTriNrm;\n' + sh.fragmentShader.replace(
      '#include <map_fragment>',
      `// + epsilon: zero-length normals (quantized/degenerate faces) would give 0/0 = NaN, which bloom smears into black blocks
      vec3 tw = pow(abs(vTriNrm), vec3(4.0)) + 1e-5; tw /= (tw.x + tw.y + tw.z);
      vec3 tp = vTriPos * uTriScale;
      vec4 tc = texture2D(uTri, tp.zy) * tw.x + texture2D(uTri, tp.xz) * tw.y + texture2D(uTri, tp.xy) * tw.z;
      diffuseColor *= tc;`
    );
  };
  material.customProgramCacheKey = () => 'tri' + scale;
  return material;
}
