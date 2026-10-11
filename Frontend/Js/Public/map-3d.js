// Student · Campus Map — the 3D viewer for an uploaded .obj model (three.js, loaded only when a 3D .obj map is opened).
// Drag to rotate, pinch / scroll to zoom, two-finger drag (or right-drag) to move. Exposes { zoom, reset, resize, dispose }.
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export async function createViewer(container, url, { onProgress } = {}) {
  // ---- download the model (text) with progress ----
  const res = await fetch(url);
  if (!res.ok) throw new Error('Could not download the model');
  const total = Number(res.headers.get('Content-Length')) || 0;
  let text;
  if (res.body && total && onProgress) {
    const reader = res.body.getReader();
    const chunks = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); got += value.length;
      onProgress(Math.min(1, got / total));
    }
    text = await new Blob(chunks).text();
  } else {
    text = await res.text();
  }

  const object = new OBJLoader().parse(text);
  let vertexCount = 0;
  const material = new THREE.MeshStandardMaterial({ color: 0xdfe6f5, roughness: 0.88, metalness: 0, side: THREE.DoubleSide });
  object.traverse((child) => {
    if (!child.isMesh) return;
    const g = child.geometry;
    if (!g.attributes.normal) g.computeVertexNormals();
    vertexCount += g.attributes.position.count;
    child.material = material;
  });
  if (!vertexCount) throw new Error('The model has no shapes to show');

  // Many exporters use Z as "up". A campus is wide and low, so the thinnest direction should be vertical.
  const box0 = new THREE.Box3().setFromObject(object);
  const size0 = box0.getSize(new THREE.Vector3());
  if (size0.z < size0.y && size0.z < size0.x) object.rotation.x = -Math.PI / 2;

  const box = new THREE.Box3().setFromObject(object);
  const centre = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  object.position.sub(centre);                 // model sits at the origin
  const radius = Math.max(size.x, size.y, size.z) || 1;

  // thin outlines make the buildings readable (skipped for very heavy models)
  if (vertexCount < 400000) {
    const lineMat = new THREE.LineBasicMaterial({ color: 0x7c8bb5, transparent: true, opacity: 0.55 });
    const lines = [];
    object.traverse((child) => { if (child.isMesh) lines.push(child); });
    lines.forEach((m) => {
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 35), lineMat);
      m.add(edges);
    });
  }

  // ---- scene ----
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.appendChild(renderer.domElement);
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.touchAction = 'none';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeef1f8);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a97b8, 1.05));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(radius, radius * 1.6, radius * 0.8);
  scene.add(sun);
  scene.add(object);

  const camera = new THREE.PerspectiveCamera(45, 1, radius / 1000, radius * 40);
  const home = new THREE.Vector3(radius * 0.95, radius * 0.8, radius * 0.95);
  camera.position.copy(home);
  camera.lookAt(0, 0, 0);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.screenSpacePanning = true;
  controls.minDistance = radius * 0.15;
  controls.maxDistance = radius * 6;
  controls.maxPolarAngle = Math.PI * 0.495;   // stay above the ground
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  controls.update();

  function resize() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = w + 'px';
    renderer.domElement.style.height = h + 'px';
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(container);

  let raf = 0, alive = true;
  (function tick() {
    if (!alive) return;
    raf = requestAnimationFrame(tick);
    controls.update();
    renderer.render(scene, camera);
  })();

  return {
    zoom(factor) {
      const offset = camera.position.clone().sub(controls.target);
      const dist = Math.min(controls.maxDistance, Math.max(controls.minDistance, offset.length() / factor));
      camera.position.copy(controls.target).add(offset.setLength(dist));
      controls.update();
    },
    reset() {
      controls.target.set(0, 0, 0);
      camera.position.copy(home);
      camera.lookAt(0, 0, 0);
      controls.update();
    },
    resize,
    dispose() {
      alive = false;
      cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      controls.dispose();
      object.traverse((c) => { if (c.geometry) c.geometry.dispose(); });
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    }
  };
}
