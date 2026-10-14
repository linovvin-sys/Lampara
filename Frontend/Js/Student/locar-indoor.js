// LocAR.js engine for the INDOOR AR guide (indoor-ar.php). ES module; exposes window.LamparaLocarIndoor.
//
// Same renderer as the outdoor guide (Js/Public/locar-engine.js): LocAR owns the camera video and the compass-driven camera.
// The difference is where the camera comes from. Indoors there is no GPS, so the page (Js/Student/indoor-ar.js) dead-reckons
// a position on the calibrated floor plan from step counting and hands it over in metres; this file just glides the camera
// there and draws the ribbon and the destination pin.
//
// Coordinates are the IndoorNav scene frame: x = east, y = scene z = -north (metres). LocAR is given a flat projection
// where "longitude" is metres east and "latitude" is metres north, so its world frame is exactly this one:
// world x = x, world z = y. Nothing here ever touches GPS.
import * as THREE from 'three';
import * as LocAR from '../../assets/vendor/locar-0.2.12/locar.es.js';

const OFF = 1000;           // LocAR's first fix fixes its world origin; keep it away from 0,0 so it is never mistaken for "no fix"
const SPACING = 1.4;        // metres between ribbon chevrons
const MAX_CHEVRONS = 14;
const GLIDE_PER_S = 6;      // camera catches up with the step-counted position at this rate (1/s), so a step is a glide, not a jump
const rad = (d) => d * Math.PI / 180;
const norm360 = (d) => ((d % 360) + 360) % 360;

const YELLOW = 0xffd100, NAVY = 0x161850;
const basicMat = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthTest: false, depthWrite: false });

function chevronShape(grow) {
  const g = grow || 0, s = new THREE.Shape();
  s.moveTo(0, 0.5 + g * 1.2); s.lineTo(0.7 + g, -0.2 - g * 0.5); s.lineTo(0.7 + g, -0.6 - g); s.lineTo(0, 0.05 - g * 0.2);
  s.lineTo(-0.7 - g, -0.6 - g); s.lineTo(-0.7 - g, -0.2 - g * 0.5); s.closePath();
  return s;
}
const flatGeo = (shape) => new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);

function labelSprite(text) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 320;
  const tex = new THREE.CanvasTexture(c);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.renderOrder = 20;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(22,24,80,.92)'; x.beginPath(); x.roundRect(16, 16, 992, 288, 72); x.fill();
  x.lineWidth = 12; x.strokeStyle = '#ffd100'; x.stroke();
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#ffffff';
  let size = 140;
  do { x.font = '700 ' + size + 'px system-ui, sans-serif'; size -= 4; } while (size > 44 && x.measureText(String(text)).width > 900);
  x.fillText(String(text), 512, 166);
  tex.needsUpdate = true;
  return sprite;
}

function disposeObj(o) {
  o.traverse((n) => {
    if (n.geometry) n.geometry.dispose();
    [].concat(n.material || []).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
  });
}

const E = {
  ready: false,
  _app: null, _locar: null, _eye: 1.6,
  _cur: null, _target: null,      // camera position now / where the steps say it should be, both { x, y }
  _chev: [], _geoms: null, _marker: null, _lastFrame: 0,

  _isIOS: /iPhone|iPad|iPod/i.test(navigator.userAgent) || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1),

  // iOS only grants motion/compass from inside a tap, so the page calls this synchronously in its click handler.
  requestMotion() {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        return DeviceOrientationEvent.requestPermission().catch(() => 'denied');
      }
    } catch (e) { return Promise.resolve('denied'); }
    return Promise.resolve('granted');
  },

  // opts: { eyeHeight, fov, start:{x,y} }
  async start(opts) {
    if (E.ready) return;
    E._eye = opts.eyeHeight || 1.6;
    E._app = new LocAR.App({
      cameraOptions: { hFov: opts.fov || 65, near: 0.1, far: 200 },
      gpsOptions: { gpsMinDistance: 0, gpsMinAccuracy: 1000 },
      deviceOrientationOptions: { enabled: true, enablePermissionDialog: false, smoothingFactor: 0.85 },
      projection: {
        project: (east, north) => [east, north],
        unproject: (x, y) => [x, y],
        getID: () => 'lampara-indoor-metres'
      }
    });
    E._locar = await E._app.start();
    const s = opts.start || { x: 0, y: 0 };
    // LocAR's first fix becomes the world origin. Seed it at (0,0) so world coords equal scene coords, THEN move the camera
    // to the start; otherwise everything drawn at absolute scene coords would sit offset by the start position.
    E._locar.fakeGps(OFF, OFF, null, 1);
    E._cur = { x: s.x, y: s.y }; E._target = { x: s.x, y: s.y };
    E._moveCamera();
    // LocAR appends its canvas under the page and its video behind it; pin both full-screen behind the HUD.
    const cv = E._app.renderer.domElement;
    cv.style.cssText += ';position:fixed;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;';
    const vid = document.querySelector('body > video');
    if (vid) vid.style.cssText += ';position:fixed;inset:0;width:100%;height:100%;object-fit:cover;z-index:-100;';
    E._fillGeo = flatGeo(chevronShape(0)); E._edgeGeo = flatGeo(chevronShape(0.1));
    E.ready = true;
    requestAnimationFrame(E._loop);
  },

  _moveCamera() { E._locar.fakeGps(OFF + E._cur.x, OFF - E._cur.y, null, 1); },

  // Where the step counter says you are. smooth=false jumps there (QR anchor, floor change).
  setPosition(x, y, jump) {
    E._target = { x, y };
    if (jump) { E._cur = { x, y }; E._moveCamera(); }
  },

  // Compass bearing the camera points at (0 = north), or null when the phone aims too far up/down to tell.
  heading() {
    if (!E._app) return null;
    const d = E._app.camera.getWorldDirection(new THREE.Vector3());
    if (Math.hypot(d.x, d.z) < 0.25) return null;
    return norm360(Math.atan2(d.x, -d.z) * 180 / Math.PI);
  },

  // The path ahead as chevrons lying on the floor, `pts` = [{x,y}] from your feet onwards. Meshes are pooled and moved,
  // since this runs on every step.
  setRoute(pts) {
    let n = 0;
    if (pts && pts.length >= 2) {
      let d = SPACING * 0.8, walked = 0;
      for (let i = 0; i < pts.length - 1 && n < MAX_CHEVRONS; i++) {
        const a = pts[i], b = pts[i + 1], len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len < 1e-6) continue;
        const bearing = norm360(Math.atan2(b.x - a.x, -(b.y - a.y)) * 180 / Math.PI);
        while (d <= walked + len && n < MAX_CHEVRONS) {
          const t = (d - walked) / len;
          E._chevron(n++, a.x + t * (b.x - a.x), a.y + t * (b.y - a.y), bearing);
          d += SPACING;
        }
        walked += len;
      }
    }
    for (let i = n; i < E._chev.length; i++) E._chev[i].obj.visible = false;
  },
  _chevron(i, x, y, bearing) {
    let c = E._chev[i];
    if (!c) {
      const obj = new THREE.Group();
      const edge = new THREE.Mesh(E._edgeGeo, basicMat(NAVY, 0.85)), fill = new THREE.Mesh(E._fillGeo, basicMat(YELLOW, 0.95));
      edge.renderOrder = 10; fill.renderOrder = 11; fill.position.y = 0.01;
      obj.add(edge, fill); obj.scale.setScalar(0.55);
      E._app.scene.add(obj);
      c = E._chev[i] = { obj, fill, edge };
    }
    c.obj.visible = true;
    c.obj.position.set(x, -E._eye, y);
    c.obj.rotation.y = -rad(bearing);
  },

  // Pin at the end of the current stretch: the destination room, or the stairs on the way. null clears it.
  setMarker(p, name) {
    if (E._marker) { E._app.scene.remove(E._marker); disposeObj(E._marker); E._marker = null; }
    if (!p) return;
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.55, 40).rotateX(-Math.PI / 2), basicMat(YELLOW, 0.95)); ring.renderOrder = 10;
    const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.6, 16, 1, true), basicMat(YELLOW, 0.35)); pil.position.y = 1.3; pil.renderOrder = 9;
    const sp = labelSprite(name || 'Destination'); sp.scale.set(2.4, 0.75, 1); sp.position.y = 3.1;
    g.add(ring, pil, sp);
    g.position.set(p.x, -E._eye, p.y);
    E._app.scene.add(g);
    E._marker = g;
  },

  stop() {
    E.ready = false;
    try { E._chev.forEach((c) => { E._app.scene.remove(c.obj); [c.fill, c.edge].forEach((m) => m.material.dispose()); }); } catch (e) { /* torn down already */ }
    E._chev = [];
    if (E._marker) { E._app.scene.remove(E._marker); disposeObj(E._marker); E._marker = null; }
    if (E._fillGeo) { E._fillGeo.dispose(); E._edgeGeo.dispose(); }
    try { E._app.stop && E._app.stop(); } catch (e) { /* older LocAR builds have no stop() */ }
    const vid = document.querySelector('body > video');
    if (vid && vid.srcObject) vid.srcObject.getTracks().forEach((t) => t.stop());
  },

  _loop(ms) {
    if (!E.ready) return;
    requestAnimationFrame(E._loop);
    const dt = Math.min(0.1, (ms - E._lastFrame) / 1000 || 0.016); E._lastFrame = ms;
    const k = 1 - Math.exp(-GLIDE_PER_S * dt);
    const dx = E._target.x - E._cur.x, dy = E._target.y - E._cur.y;
    if (Math.abs(dx) + Math.abs(dy) > 0.001) {
      E._cur.x += dx * k; E._cur.y += dy * k;
      E._moveCamera();
    }
    const s = ms / 1000;
    E._chev.forEach((c, i) => {
      if (!c.obj.visible) return;
      const pulse = 0.5 + 0.5 * Math.sin((i * SPACING / 9 - s * 1.1) * Math.PI * 2);
      c.fill.material.opacity = 0.45 + 0.55 * pulse; c.edge.material.opacity = 0.35 + 0.5 * pulse;
    });
  }
};
E._loop = E._loop.bind(E);
window.LamparaLocarIndoor = E;
window.dispatchEvent(new Event('lampara-locar-indoor-loaded'));
