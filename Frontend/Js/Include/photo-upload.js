// Photo picker for the admin editors: choose or drop a picture, move and zoom it inside a 4:3 frame, and get
// back a ready-to-upload JPEG (1200x900). The server never has to resize anything.
// pick({ portrait: true }) also allows a 3:4 frame (900x1200): a tall photo opens in it automatically, and a
// Landscape / Portrait switch lets the admin change it. Used for room photos.
//
//   const dataUrl = await LamparaPhoto.pick({ title: 'Building photo' });     // null if cancelled
//   const path = await LamparaPhoto.upload('building', 12, dataUrl);            // 'assets/photos/...'
//   await LamparaPhoto.remove('building', 12);
//
// pick({ file }) skips the first step when a picture was already dropped onto the page.
// Plain <script>; exposes `LamparaPhoto`.
const LamparaPhoto = (() => {
  let FW = 960, FH = 720;            // the frame, in canvas units (4:3 landscape, or 3:4 portrait when switched)
  let OUT_W = 1200, OUT_H = 900;     // the exported picture
  let allowPortrait = false, portrait = false;
  const MAX_RAW = 25 * 1024 * 1024;  // refuse enormous originals before decoding them
  const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const API = '../../../Backend/api/photos.php';

  let dlg = null, els = null, img = null, view = null, resolver = null, drag = null;

  function el(tag, attrs, children) {
    const n = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else n.setAttribute(k, v);
    });
    (children || []).forEach((c) => n.appendChild(c));
    return n;
  }

  function build() {
    if (dlg) return;
    const drop = el('div', { class: 'pd-drop', tabindex: '0', role: 'button', 'aria-label': 'Choose a photo, or drop one here' }, [
      el('div', { class: 'pd-drop-icon', 'aria-hidden': 'true', text: '▣' }),
      el('strong', { text: 'Drop a photo here' }),
      el('span', { text: 'or choose one from this device' }),
    ]);
    const file = el('input', { type: 'file', accept: TYPES.join(','), class: 'sr-only', 'aria-label': 'Photo file' });
    const camera = el('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'sr-only', 'aria-label': 'Take a photo' });
    const choose = el('button', { type: 'button', class: 'btn btn-secondary', text: 'Choose photo' });
    const take = el('button', { type: 'button', class: 'btn btn-secondary pd-take', text: 'Take photo' });
    const err = el('p', { class: 'pd-error', role: 'alert' });
    const step1 = el('div', { class: 'pd-step1' }, [drop, el('div', { class: 'pd-pick-row' }, [choose, take]), file, camera, err]);

    const canvas = el('canvas', { width: String(FW), height: String(FH), class: 'pd-canvas', tabindex: '0', role: 'img', 'aria-label': 'Photo preview. Drag to move it, or use the arrow keys.' });
    const zoom = el('input', { type: 'range', min: '1', max: '3', step: '0.01', value: '1', 'aria-label': 'Zoom' });
    const shapeL = el('button', { type: 'button', class: 'pd-shape-btn', text: 'Landscape', 'aria-pressed': 'true' });
    const shapeP = el('button', { type: 'button', class: 'pd-shape-btn', text: 'Portrait', 'aria-pressed': 'false' });
    const shape = el('div', { class: 'pd-shape', role: 'group', 'aria-label': 'Photo shape', hidden: '' }, [shapeL, shapeP]);
    const step2 = el('div', { class: 'pd-step2', hidden: '' }, [
      el('div', { class: 'pd-stage' }, [canvas]),
      shape,
      el('label', { class: 'pd-zoom' }, [el('span', { text: 'Zoom' }), zoom]),
      el('p', { class: 'pd-hint', text: 'Drag the picture to choose what shows. Arrow keys also move it.' }),
    ]);

    const title = el('h3', { id: 'pdTitle', text: 'Photo' });
    const close = el('button', { type: 'button', class: 'pd-close', 'aria-label': 'Close' });
    close.innerHTML = '&times;';
    const cancel = el('button', { type: 'button', class: 'btn btn-secondary', text: 'Cancel' });
    const change = el('button', { type: 'button', class: 'btn btn-secondary', text: 'Choose another', hidden: '' });
    const use = el('button', { type: 'button', class: 'btn btn-primary', text: 'Use this photo', disabled: '' });

    dlg = el('dialog', { class: 'photo-dialog', 'aria-labelledby': 'pdTitle' }, [
      el('div', { class: 'pd-head' }, [title, close]),
      el('div', { class: 'pd-body' }, [step1, step2]),
      el('div', { class: 'pd-foot' }, [cancel, change, use]),
    ]);
    document.body.appendChild(dlg);
    els = { shape, shapeL, shapeP, title, drop, file, camera, choose, take, err, step1, step2, canvas, zoom, cancel, change, use, close };

    const pickFile = () => file.click();
    drop.addEventListener('click', pickFile);
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickFile(); } });
    choose.addEventListener('click', pickFile);
    take.addEventListener('click', () => camera.click());
    [file, camera].forEach((inp) => inp.addEventListener('change', () => { if (inp.files[0]) load(inp.files[0]); inp.value = ''; }));
    ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
    ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('is-over'); }));
    drop.addEventListener('drop', (e) => { const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) load(f); });

    canvas.addEventListener('pointerdown', (e) => {
      if (!img) return;
      canvas.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, ox: view.ox, oy: view.oy };
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const k = FW / canvas.getBoundingClientRect().width;
      view.ox = drag.ox + (e.clientX - drag.x) * k;
      view.oy = drag.oy + (e.clientY - drag.y) * k;
      draw();
    });
    ['pointerup', 'pointercancel'].forEach((t) => canvas.addEventListener(t, () => { drag = null; }));
    canvas.addEventListener('keydown', (e) => {
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (!d || !img) return;
      e.preventDefault();
      const step = e.shiftKey ? 60 : 15;
      view.ox += d[0] * step; view.oy += d[1] * step; draw();
    });
    zoom.addEventListener('input', () => {
      if (!img) return;
      // zoom around the middle of the frame, so what you are looking at stays put
      const cx = (FW / 2 - view.ox) / view.scale, cy = (FH / 2 - view.oy) / view.scale;
      view.zoom = parseFloat(zoom.value);
      view.scale = view.base * view.zoom;
      view.ox = FW / 2 - cx * view.scale; view.oy = FH / 2 - cy * view.scale;
      draw();
    });

    shapeL.addEventListener('click', () => { if (img) setFrame(false); });
    shapeP.addEventListener('click', () => { if (img) setFrame(true); });
    change.addEventListener('click', () => { reset(); });
    cancel.addEventListener('click', () => finish(null));
    close.addEventListener('click', () => finish(null));
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); finish(null); });
    use.addEventListener('click', () => finish(exportJpeg()));
  }

  function reset() {
    img = null; view = null;
    els.err.textContent = '';
    els.step1.hidden = false; els.step2.hidden = true;
    els.change.hidden = true; els.use.disabled = true;
    els.zoom.value = '1';
  }

  async function load(file) {
    els.err.textContent = '';
    if (!TYPES.includes(file.type)) { els.err.textContent = 'Please choose a JPEG, PNG or WebP picture.'; return; }
    if (file.size > MAX_RAW) { els.err.textContent = 'That file is very large. Choose one under 25 MB.'; return; }
    try {
      img = await decode(file);
    } catch (e) {
      img = null;
      els.err.textContent = "Couldn't open that picture. Try a different one.";
      return;
    }
    if (Math.min(img.width, img.height) < 225 || Math.max(img.width, img.height) < 300) {
      els.err.textContent = 'That picture is small and will look blurry. Choose one at least 300 x 225 pixels.';
      img = null; return;
    }
    els.shape.hidden = !allowPortrait;
    setFrame(allowPortrait && img.height > img.width);   // a tall photo opens in the tall frame
    els.step1.hidden = true; els.step2.hidden = false;
    els.change.hidden = false; els.use.disabled = false;
    els.canvas.focus();
  }

  // Switch between the landscape and portrait frame and re-centre the picture in it.
  function setFrame(tall) {
    portrait = tall;
    FW = tall ? 720 : 960; FH = tall ? 960 : 720;
    OUT_W = tall ? 900 : 1200; OUT_H = tall ? 1200 : 900;
    els.canvas.width = FW; els.canvas.height = FH;
    els.canvas.style.aspectRatio = FW + ' / ' + FH;
    els.canvas.parentNode.classList.toggle('is-tall', tall);
    els.shapeL.setAttribute('aria-pressed', String(!tall)); els.shapeP.setAttribute('aria-pressed', String(tall));
    const base = Math.max(FW / img.width, FH / img.height);
    view = { base, zoom: 1, scale: base, ox: (FW - img.width * base) / 2, oy: (FH - img.height * base) / 2 };
    els.zoom.value = '1';
    draw();
  }

  async function decode(file) {
    if (window.createImageBitmap) {
      try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { /* fall through */ }
    }
    return await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), im = new Image();
      im.onload = () => { URL.revokeObjectURL(url); resolve(im); };
      im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
      im.src = url;
    });
  }

  function clamp() {
    const w = img.width * view.scale, h = img.height * view.scale;
    view.ox = Math.min(0, Math.max(FW - w, view.ox));
    view.oy = Math.min(0, Math.max(FH - h, view.oy));
  }

  function draw() {
    clamp();
    const c = els.canvas.getContext('2d');
    c.fillStyle = '#e8e8f2'; c.fillRect(0, 0, FW, FH);
    c.drawImage(img, view.ox, view.oy, img.width * view.scale, img.height * view.scale);
  }

  function exportJpeg() {
    const k = OUT_W / FW, out = document.createElement('canvas');
    out.width = OUT_W; out.height = OUT_H;
    const c = out.getContext('2d');
    c.fillStyle = '#fff'; c.fillRect(0, 0, OUT_W, OUT_H);
    c.drawImage(img, view.ox * k, view.oy * k, img.width * view.scale * k, img.height * view.scale * k);
    return out.toDataURL('image/jpeg', 0.84);
  }

  function finish(value) {
    if (dlg.open) dlg.close();
    const r = resolver; resolver = null;
    if (r) r(value);
  }

  function pick(opts) {
    opts = opts || {};
    build();
    els.title.textContent = opts.title || 'Photo';
    allowPortrait = !!opts.portrait;
    reset();
    return new Promise((resolve) => {
      resolver = resolve;
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
      if (opts.file) load(opts.file);
    });
  }

  async function upload(entity, id, dataUrl) {
    const res = await fetch(API + '?entity=' + encodeURIComponent(entity) + '&id=' + encodeURIComponent(id), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
      body: JSON.stringify({ image: dataUrl })
    });
    const data = await res.json().catch(() => ({ success: false, error: 'The server sent an unreadable reply.' }));
    if (!data.success) throw new Error(data.error || 'Upload failed');
    return data.photo_path;
  }

  async function remove(entity, id) {
    const res = await fetch(API + '?entity=' + encodeURIComponent(entity) + '&id=' + encodeURIComponent(id), { method: 'DELETE', credentials: 'same-origin' });
    const data = await res.json().catch(() => ({ success: false, error: 'The server sent an unreadable reply.' }));
    if (!data.success) throw new Error(data.error || 'Could not remove the photo');
  }

  return { pick, upload, remove };
})();
