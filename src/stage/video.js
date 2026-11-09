import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';

const YT_ORIGIN = 'https://www.youtube.com'; // only ever post player commands to YouTube

// A YouTube player placed in 3D with CSS3DRenderer *behind* the WebGL canvas.
// A matching "hole" mesh writes transparent pixels into the canvas, so the video
// shows through exactly where the LED screen is and is still hidden by anything in front.
export class VideoLayer {
  constructor(container) {
    this.renderer = new CSS3DRenderer();
    this.renderer.domElement.className = 'css3d';
    container.prepend(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.players = [];
  }

  addScreen({ id, start = 0, w, h, position, rotationY = 0, px = 1280 }) {
    const el = document.createElement('div');
    el.className = 'yt-screen';
    el.style.width = px + 'px';
    el.style.height = Math.round((px * h) / w) + 'px';
    const params = new URLSearchParams({
      autoplay: '1', mute: '1', controls: '0', playsinline: '1', loop: '1', playlist: id,
      rel: '0', modestbranding: '1', enablejsapi: '1', start: String(start), origin: location.origin,
    });
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube.com/embed/${id}?${params}`;
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.title = 'Video trực tiếp trên màn LED';
    el.appendChild(iframe);

    const obj = new CSS3DObject(el);
    obj.scale.setScalar(w / px);
    obj.position.copy(position);
    obj.rotation.y = rotationY;
    this.scene.add(obj);

    const hole = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0, blending: THREE.NoBlending, fog: false })
    );
    hole.position.copy(position);
    hole.rotation.y = rotationY;
    this.players.push(iframe);
    return hole;
  }

  command(func, args = []) {
    this.players.forEach((f) => f.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), YT_ORIGIN));
  }
  commandMain(func, args = []) {
    this.players[0]?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), YT_ORIGIN);
  }

  setSize(w, h) { this.renderer.setSize(w, h); }
  render(camera) { this.renderer.render(this.scene, camera); }
}
