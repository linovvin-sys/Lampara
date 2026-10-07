// Ground ribbon for AR guides — a flat, chevron-patterned strip lying on the floor
// along a path. Shared by the outdoor guide (guide-ar.js) and the indoor guide
// (indoor-ar.js). Plain <script>; needs A-Frame (AFRAME.THREE) already loaded.
//
// Usage:
//   const ribbon = ArRibbon.create(sceneEl);
//   ribbon.update(points, { fadeEnd: false });   // [{x, y}] in scene meters (x = east, y = scene z), starting at your feet
//   fadeEnd (default true): dissolve the far end. Pass false when the ribbon runs all the way to
//   the destination marker, so it stays solid and visibly connects to it.
//   ribbon.remove();
const ArRibbon = (() => {
  // The camera sits ~1.6 scene units up (the a-camera default) while a phone is
  // really held ~1.4 m off the ground, so the ground is roughly 0.2 above y=0.
  const GROUND_Y = 0.2;
  const HALF_WIDTH = 0.6;
  const CHEVRON_METERS = 2;   // one chevron per this much path
  // Chevrons stay still: a scrolling texture made a perfectly still path look like it was
  // sliding. Set above 0 (chevron repeats per second) to bring the drift back.
  const SCROLL_SPEED = 0;

  // Chevron pattern, tileable along the path. Canvas top = +v = walking direction.
  function createTexture() {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, 'rgba(56,189,248,0.55)');
    grad.addColorStop(1, 'rgba(16,185,129,0.55)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 256);
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineWidth = 16;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(30, 170); g.lineTo(64, 120); g.lineTo(98, 170);
    g.stroke();
    const tex = new AFRAME.THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = AFRAME.THREE.RepeatWrapping;
    return tex;
  }

  // Flat strip along an {x,y} polyline (x/y = scene x/z), lying at GROUND_Y.
  // Alpha fades in over the first 2 m (so it doesn't clip the camera) and out
  // over the last 40% (so the far end dissolves instead of just stopping).
  function buildGeometry(pts, fadeEnd = true) {
    const THREE = AFRAME.THREE;
    const positions = [], uvs = [], colors = [], indices = [];
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    const total = cum[cum.length - 1] || 1;
    const segNormal = (a, b) => {
      const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
      return { x: -dy / l, y: dx / l };
    };
    for (let i = 0; i < pts.length; i++) {
      const n0 = segNormal(pts[Math.max(0, i - 1)], pts[i === 0 ? 1 : i]);
      const n1 = segNormal(pts[i === pts.length - 1 ? i - 1 : i], pts[Math.min(pts.length - 1, i + 1)]);
      let nx = n0.x + n1.x, ny = n0.y + n1.y;
      const nl = Math.hypot(nx, ny) || 1;
      nx /= nl; ny /= nl;
      const miter = Math.min(1.6, 1 / Math.max(0.6, nx * n0.x + ny * n0.y));
      const ox = nx * HALF_WIDTH * miter, oy = ny * HALF_WIDTH * miter;
      positions.push(pts[i].x + ox, GROUND_Y, pts[i].y + oy, pts[i].x - ox, GROUND_Y, pts[i].y - oy);
      const v = cum[i] / CHEVRON_METERS;
      uvs.push(0, v, 1, v);
      const fadeIn = Math.min(1, cum[i] / 2);
      const fadeOut = fadeEnd ? Math.min(1, (total - cum[i]) / (total * 0.4)) : 1;
      const a = Math.max(0, Math.min(fadeIn, fadeOut));
      colors.push(1, 1, 1, a, 1, 1, 1, a);
      if (i < pts.length - 1) {
        const k = i * 2;
        indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
    geo.setIndex(indices);
    return geo;
  }

  function registerScroll() {
    if (AFRAME.components['ribbon-scroll']) return;
    // Drifts the chevron texture toward the destination so the ribbon reads as
    // "go this way" even when you're standing still.
    AFRAME.registerComponent('ribbon-scroll', {
      tick(time, dt) {
        const tex = this.el.__ribbonTexture;
        if (tex) tex.offset.y -= (dt / 1000) * SCROLL_SPEED;
      }
    });
  }

  function create(scene) {
    registerScroll();
    let state = null; // { entity, mesh, texture }

    return {
      update(pts, opts = {}) {
        if (pts.length < 2) return;
        const geo = buildGeometry(pts, opts.fadeEnd !== false);
        if (!state) {
          const THREE = AFRAME.THREE;
          const texture = createTexture();
          const material = new THREE.MeshBasicMaterial({
            map: texture, vertexColors: true, transparent: true, side: THREE.DoubleSide, depthWrite: false
          });
          const mesh = new THREE.Mesh(geo, material);
          mesh.frustumCulled = false; // geometry is rebuilt in world space; skip stale bounding-sphere culling
          const entity = document.createElement('a-entity');
          if (SCROLL_SPEED) entity.setAttribute('ribbon-scroll', '');
          entity.__ribbonTexture = texture;
          entity.setObject3D('mesh', mesh);
          scene.appendChild(entity);
          state = { entity, mesh, texture };
        } else {
          state.mesh.geometry.dispose();
          state.mesh.geometry = geo;
        }
      },
      // Shifts the whole ribbon entity vertically. The geometry's own Y is
      // baked in at GROUND_Y, which only lands ~1.4m below the camera when
      // the camera itself sits at the assumed y=1.6 (true indoors, where
      // the camera's position is fixed — NOT true outdoors, where
      // gps-new-camera only tracks horizontal GPS and never sets altitude
      // at all, leaving the camera's real Y wherever A-Frame happens to
      // default it). A caller that knows the camera's actual live Y should
      // call this with (camY - 1.4) so the ribbon tracks a consistent
      // distance below the camera regardless of what that real Y is.
      setGroundY(y) {
        if (state) state.entity.object3D.position.y = y;
      },
      getGroundY() {
        return state ? state.entity.object3D.position.y : null;
      },
      remove() {
        if (!state) return;
        if (state.entity.parentNode) state.entity.parentNode.removeChild(state.entity);
        state.mesh.geometry.dispose();
        state.mesh.material.dispose();
        state.texture.dispose();
        state = null;
      },
      get active() { return state !== null; }
    };
  }

  return { create, GROUND_Y };
})();
