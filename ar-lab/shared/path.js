/* AR Lab — the A -> B path visual, built once and used by every engine so the engines are compared
   on tracking quality and not on how the arrow looks.

   Form: a ribbon of flat yellow chevrons ( > ) lying on the ground every few metres from A to B,
   all pointing toward B, with a pulse that runs toward B; a ring on the ground at A; and a tall
   translucent beacon with a text label at B.

   Needs a THREE namespace passed in (global THREE or an ES module import) and returns plain
   THREE objects. Each engine places them its own way (by lat/lng, or in a SLAM frame). */
(function () {
  'use strict';
  const YELLOW = 0xffd100, NAVY = 0x161850;

  function chevronShape(THREE, grow) {
    const g = grow || 0, s = new THREE.Shape();
    s.moveTo(0, 0.5 + g * 1.2);
    s.lineTo(0.7 + g, -0.2 - g * 0.5);
    s.lineTo(0.7 + g, -0.6 - g);
    s.lineTo(0, 0.05 - g * 0.2);
    s.lineTo(-0.7 - g, -0.6 - g);
    s.lineTo(-0.7 - g, -0.2 - g * 0.5);
    s.closePath();
    return s;
  }

  function flat(THREE, shape) {              // shape drawn in XY, laid flat so its tip points to -Z (north at yaw 0)
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }

  function mat(THREE, color, opacity) {
    return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthTest: false, depthWrite: false });
  }

  function makeChevron(THREE, geoFill, geoEdge) {
    const g = new THREE.Group();
    const edge = new THREE.Mesh(geoEdge, mat(THREE, NAVY, 0.85));
    const fill = new THREE.Mesh(geoFill, mat(THREE, YELLOW, 0.95));
    edge.renderOrder = 10; fill.renderOrder = 11; fill.position.y = 0.01;
    g.add(edge, fill);
    g.userData.fill = fill; g.userData.edge = edge;
    return g;
  }

  function labelSprite(THREE, text, accent) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 160;
    const tex = new THREE.CanvasTexture(c);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sprite.renderOrder = 20;
    sprite.userData.setText = function (t) {
      const x = c.getContext('2d'); x.clearRect(0, 0, c.width, c.height);
      x.fillStyle = 'rgba(22,24,80,.92)'; x.beginPath(); x.roundRect(8, 8, 496, 144, 36); x.fill();
      x.lineWidth = 6; x.strokeStyle = accent || '#ffd100'; x.stroke();
      x.fillStyle = '#ffffff'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = '700 58px system-ui, sans-serif'; x.fillText(String(t).slice(0, 22), 256, 82);
      tex.needsUpdate = true;
    };
    sprite.userData.setText(text);
    return sprite;
  }

  // Everything the engines need, unplaced (all objects sit at the origin, facing north).
  //   items:   chevrons  [{ obj, lat, lng, dist, bearing }]
  //   start:   { obj, lat, lng }  ring at A
  //   end:     { obj, lat, lng, label, setText }  beacon at B
  //   animate(tSec): run each frame
  //   orient(item, frameBearingDeg): yaw an item to a bearing expressed in the engine's own frame
  function build(THREE, route, opts) {
    opts = opts || {};
    const geo = ARLab.geo;
    const pts = route.points && route.points.length > 1 ? route.points : [route.a, route.b];
    const sm = geo.samplePolyline(pts, opts.spacing || ARLab.cfg.spacing, opts.maxCount || 90);
    const size = opts.size || 1;
    const fillGeo = flat(THREE, chevronShape(THREE, 0)), edgeGeo = flat(THREE, chevronShape(THREE, 0.1));

    const chevrons = sm.stations.map((st) => {
      const obj = makeChevron(THREE, fillGeo, edgeGeo);
      obj.scale.setScalar(size);
      obj.rotation.y = -geo.rad(st.bearing);
      return { obj, lat: st.lat, lng: st.lng, dist: st.dist, bearing: st.bearing };
    });

    const ringGeo = new THREE.RingGeometry(0.55, 0.8, 40).rotateX(-Math.PI / 2);
    const startObj = new THREE.Mesh(ringGeo, mat(THREE, YELLOW, 0.95)); startObj.renderOrder = 10;
    if (opts.noStart) startObj.visible = false;             // later legs begin where the last one ended: no ring
    const start = { obj: startObj, lat: route.a.lat, lng: route.a.lng };

    const end = new THREE.Group();
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 14, 24, 1, true), mat(THREE, YELLOW, 0.28));
    pillar.position.y = 7; pillar.renderOrder = 9;
    const base = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.4, 48).rotateX(-Math.PI / 2), mat(THREE, YELLOW, 0.95));
    base.renderOrder = 10;
    const sprite = labelSprite(THREE, route.label || 'Point B');
    sprite.scale.set(4.8, 1.5, 1); sprite.position.y = 15.15;
    end.add(pillar, base, sprite);
    const endItem = { obj: end, lat: route.b.lat, lng: route.b.lng, label: sprite, setText: sprite.userData.setText };
    let lastText = '';
    // Keeps the B label readable from far away (grows with distance) and shows the live distance on it.
    // The label's BOTTOM stays fixed on top of the pillar and it grows upward from there, so the marker never
    // slides up or down in the world as you walk (it used to rise with distance, which looked like it was flying).
    endItem.update = function (distToB) {
      const s = Math.max(1, distToB / 25);
      sprite.scale.set(4.8 * s, 1.5 * s, 1); sprite.position.y = 14.4 + 0.75 * s;
      const txt = (route.label || 'Point B') + '  ' + (distToB >= 1000 ? (distToB / 1000).toFixed(1) + ' km' : Math.round(distToB) + ' m');
      if (txt !== lastText) { lastText = txt; sprite.userData.setText(txt); }
    };

    // The other stops of a multi-stop route stay in the scene as fixed anchors at their own coordinates, so every point is
    // a stable place and not something that appears and disappears with the leg:
    //   'reached'  a stop already passed: green, with a tick
    //   'locked'   a stop still ahead: grey, no path to it yet (its path only appears once the current stop is reached)
    const STATE = { reached: { color: 0x2fbf71, accent: '#2fbf71', op: 0.3, tag: ' ✓' }, locked: { color: 0x9aa0c8, accent: '#9aa0c8', op: 0.16, tag: ' (locked)' } };
    const markers = (opts.others || []).map((st) => {
      const sty = STATE[st.state] || STATE.locked, g = new THREE.Group();
      const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 9, 20, 1, true), mat(THREE, sty.color, sty.op));
      pil.position.y = 4.5; pil.renderOrder = 8;
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.1, 40).rotateX(-Math.PI / 2), mat(THREE, sty.color, 0.8));
      ring.renderOrder = 9;
      const sp = labelSprite(THREE, (st.label || 'Stop') + sty.tag, sty.accent);
      sp.scale.set(5.2, 1.6, 1); sp.position.y = 10;
      g.add(pil, ring, sp);
      return { obj: g, lat: st.lat, lng: st.lng, state: st.state };
    });

    function animate(t) {
      for (const c of chevrons) {
        const phase = c.dist / 9 - t * 1.1;                  // wave travels toward B
        const pulse = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
        c.obj.userData.fill.material.opacity = 0.45 + 0.55 * pulse;
        c.obj.userData.edge.material.opacity = 0.35 + 0.5 * pulse;
      }
      base.rotation.y = t * 0.8;
      pillar.material.opacity = 0.22 + 0.1 * Math.sin(t * 2);
    }
    function orient(item, frameBearingDeg) { item.obj.rotation.y = -geo.rad(frameBearingDeg); }

    const items = () => chevrons.concat([start, endItem], markers);
    // Frees the GPU memory when a leg is replaced by the next one.
    function dispose() {
      items().forEach((it) => it.obj.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        [].concat(o.material || []).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
      }));
    }

    return { chevrons, start, end: endItem, markers, items, dispose, animate, orient, total: sm.total, bearing: sm.bearing, spacing: sm.spacing };
  }

  window.ARLab = Object.assign(window.ARLab || {}, { path: { build } });
})();
