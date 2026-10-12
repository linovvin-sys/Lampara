// Admin · Campus Map — upload / replace / remove the static 2D and 3D campus maps.
// Talks to Backend/api/static-maps.php. Uploading needs a connection, so it is blocked while offline.
const { createApp } = Vue;

const API = '../../../Backend/api/static-maps.php';
const MK_API = '../../../Backend/api/static-map-markers.php';
const MAX_SIDE = 4000;           // longest side after shrinking, px
const KEEP_AS_IS_BYTES = 2.5 * 1024 * 1024; // small enough files are uploaded untouched
const LIMITS = { svg: 8, pdf: 20, obj: 25 };  // MB, same as the server
const PDFJS = '../../assets/vendor/pdfjs/';

let pdfPromise = null;
function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (!pdfPromise) {
    pdfPromise = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = PDFJS + 'pdf.min.js';
      el.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js'; resolve(window.pdfjsLib); };
      el.onerror = () => reject(new Error('Could not load the PDF viewer'));
      document.head.appendChild(el);
    });
  }
  return pdfPromise;
}

createApp({
  data() {
    return {
      kinds: [
        { kind: '2d', short: '2D', label: '2D map', help: 'A flat, top-down map of the campus. PNG, JPG, WebP, SVG or PDF.', placeholder: 'e.g. NCST campus map',
          formats: ['png', 'jpeg', 'webp', 'svg', 'pdf'], accept: 'image/png,image/jpeg,image/webp,image/svg+xml,application/pdf,.svg,.pdf' },
        { kind: '3d', short: '3D', label: '3D map', help: 'A 3D model of the campus (.obj) that students can rotate, or a 3D render as a picture.', placeholder: 'e.g. NCST campus in 3D',
          formats: ['png', 'jpeg', 'webp', 'obj'], accept: 'image/png,image/jpeg,image/webp,.obj' }
      ],
      loaded: false,       // first answer from the server has arrived (until then previews show a skeleton)
      maps: { '2d': null, '3d': null },
      titles: { '2d': '', '3d': '' },
      thumbs: { '2d': null, '3d': null }, // first-page picture for PDF maps
      buildings: [],
      markers: [],
      mkKind: '2d',        // which map the pin editor shows
      mkType: 'entrance',  // what a click on the map drops
      mkBuilding: '',
      mkLabel: '',
      quickPlaces: ['Admission', 'Treasury', 'Clinic', 'Faculty', 'Registrar', 'Library', 'Cashier', 'Guidance'],
      selectedId: null,
      mkBusy: false,
      dragMoved: false,
      busy: null,          // which kind is uploading / removing right now
      busyText: ''
    };
  },
  computed: {
    selected() { return this.markers.find((m) => m.id === this.selectedId) || null; },
    // the picture the pins are placed on (a PDF uses its first page picture; an .obj can't be pinned)
    markerBase() { return this.previewSrc(this.mkKind); }
  },
  mounted() {
    this.load(); this.loadBuildings(); this.loadMarkers();
    // reopen on the tab you were last on (or the one in the link: campus-map.php#3d)
    let want = (location.hash || '').replace('#', '');
    if (want !== '2d' && want !== '3d') { try { want = localStorage.getItem('lampara_map_tab') || ''; } catch (e) { want = ''; } }
    if (want === '2d' || want === '3d') this.mkKind = want;
  },
  methods: {
    selectTab(kind) {
      this.mkKind = kind;
      this.selectedId = null;
      try { localStorage.setItem('lampara_map_tab', kind); } catch (e) { /* storage blocked */ }
    },
    markersOf(kind) { return this.markers.filter((m) => m.kind === kind); },
    async loadBuildings() {
      try {
        const data = await (await fetch('../../../Backend/api/buildings.php', { cache: 'no-store' })).json();
        if (data.success) this.buildings = data.buildings;
      } catch (e) { /* offline */ }
    },
    async loadMarkers() {
      try {
        const data = await (await fetch(MK_API, { cache: 'no-store' })).json();
        if (data.success) this.markers = data.markers;
      } catch (e) { /* offline */ }
    },
    // click on the map picture: drop a pin with the current settings
    async canvasClick(e) {
      if (this.dragMoved) { this.dragMoved = false; return; }
      const img = this.$refs.mkImg;
      if (!img) return;
      const r = img.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width * 100, y = (e.clientY - r.top) / r.height * 100;
      if (x < 0 || x > 100 || y < 0 || y > 100) return;
      await this.addPinAt(x, y);
    },
    // Keyboard alternative to clicking the map: the new pin goes in the middle, then arrow keys move it.
    async addPinAtCenter() {
      await this.addPinAt(50, 50);
      this.$nextTick(() => { const el = document.querySelector('.mk-pin.sel'); if (el) el.focus(); });
    },
    // Arrow keys on a focused pin: 0.5% per press (Shift: 2%). Saved after a short pause so a held key is one request.
    onPinKey(m, e) {
      if (e.key === 'Delete') { e.preventDefault(); this.selectedId = m.id; this.removeSelected(); return; }
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (!d) return;
      e.preventDefault();
      const step = e.shiftKey ? 2 : 0.5;
      m.x = Math.max(0, Math.min(100, Math.round((m.x + d[0] * step) * 10) / 10));
      m.y = Math.max(0, Math.min(100, Math.round((m.y + d[1] * step) * 10) / 10));
      this.selectedId = m.id;
      clearTimeout(this._pinSave);
      this._pinSave = setTimeout(async () => {
        if (!(await AdminOffline.guardOnline('Moving a pin'))) { this.loadMarkers(); return; }
        try {
          await fetch(MK_API + '?id=' + m.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ x: m.x, y: m.y }) });
        } catch (err) { this.loadMarkers(); }
      }, 400);
    },
    async addPinAt(x, y) {
      if (this.mkType === 'entrance' && !this.mkBuilding) {
        Swal.fire({ icon: 'info', title: 'Choose a building first', text: 'Pick the building this entrance belongs to, then click the map.' });
        return;
      }
      if (this.mkType === 'landmark' && !this.mkLabel.trim()) {
        Swal.fire({ icon: 'info', title: 'Name the key place', text: 'Type a name (for example Admission) or use a quick pick, then click the map.' });
        return;
      }
      if (!(await AdminOffline.guardOnline('Adding a pin'))) return;
      this.mkBusy = true;
      try {
        const res = await fetch(MK_API, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: this.mkKind, marker_type: this.mkType, building_id: this.mkType === 'gate' ? null : (this.mkBuilding || null), label: this.mkLabel, x, y })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Could not add the pin');
        this.markers.push(data.marker);
        this.selectedId = data.marker.id;
        this.mkLabel = '';
      } catch (err) {
        Swal.fire({ icon: 'error', title: 'Could not add the pin', text: err.message });
      } finally { this.mkBusy = false; }
    },
    // dragging an existing pin
    startDrag(m, e) {
      this.selectedId = m.id;
      const img = this.$refs.mkImg;
      const r = img.getBoundingClientRect();
      this.dragMoved = false;
      const move = (ev) => {
        this.dragMoved = true;
        m.x = Math.max(0, Math.min(100, (ev.clientX - r.left) / r.width * 100));
        m.y = Math.max(0, Math.min(100, (ev.clientY - r.top) / r.height * 100));
      };
      const up = async () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        if (!this.dragMoved) return;
        setTimeout(() => { this.dragMoved = false; }, 0);
        if (!(await AdminOffline.guardOnline('Moving a pin'))) { this.loadMarkers(); return; }
        try {
          await fetch(MK_API + '?id=' + m.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ x: m.x, y: m.y }) });
        } catch (err) { this.loadMarkers(); }
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    async saveSelected() {
      const m = this.selected;
      if (!m) return;
      if (!(await AdminOffline.guardOnline('Saving a pin'))) return;
      this.mkBusy = true;
      try {
        const res = await fetch(MK_API + '?id=' + m.id, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ marker_type: m.marker_type, building_id: m.marker_type === 'gate' ? null : (m.building_id || null), label: m.label || '', x: m.x, y: m.y })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Could not save');
        const i = this.markers.findIndex((x) => x.id === m.id);
        if (i >= 0) this.markers.splice(i, 1, data.marker);
      } catch (err) {
        Swal.fire({ icon: 'error', title: 'Could not save the pin', text: err.message });
      } finally { this.mkBusy = false; }
    },
    async removeSelected() {
      const m = this.selected;
      if (!m) return;
      const ok = await Swal.fire({ icon: 'warning', title: 'Delete this pin?', text: m.name, showCancelButton: true, confirmButtonText: 'Delete', confirmButtonColor: '#ff0000' });
      if (!ok.isConfirmed) return;
      if (!(await AdminOffline.guardOnline('Deleting a pin'))) return;
      this.mkBusy = true;
      try {
        const data = await (await fetch(MK_API + '?id=' + m.id, { method: 'DELETE' })).json();
        if (!data.success) throw new Error(data.error || 'Could not delete');
        this.markers = this.markers.filter((x) => x.id !== m.id);
        this.selectedId = null;
      } catch (err) {
        Swal.fire({ icon: 'error', title: 'Could not delete the pin', text: err.message });
      } finally { this.mkBusy = false; }
    },
    imgSrc(map) { return '../../' + map.image_path + '?v=' + encodeURIComponent(map.updated_at || ''); },
    // what to show in the preview box: the image itself, or a picture of a PDF's first page; null for .obj
    previewSrc(kind) {
      const m = this.maps[kind];
      if (!m) return null;
      if (m.format === 'pdf') return this.thumbs[kind];
      if (m.format === 'obj') return null;
      return this.imgSrc(m);
    },
    async makeThumb(kind) {
      const m = this.maps[kind];
      this.thumbs[kind] = null;
      if (!m || m.format !== 'pdf') return;
      try {
        const lib = await loadPdfJs();
        const pdf = await lib.getDocument({ url: this.imgSrc(m) }).promise;
        const page = await pdf.getPage(1);
        const vp = page.getViewport({ scale: 1 });
        const v = page.getViewport({ scale: 900 / Math.max(vp.width, vp.height) });
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(v.width); canvas.height = Math.round(v.height);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: v }).promise;
        this.thumbs[kind] = canvas.toDataURL('image/jpeg', 0.85);
      } catch (e) { /* the "PDF map" placeholder shows instead */ }
    },
    when(ts) {
      if (!ts) return '';
      const d = new Date(ts.replace(' ', 'T'));
      return isNaN(d) ? ts : d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    },
    async load() {
      try {
        const res = await fetch(API, { cache: 'no-store' });
        const data = await res.json();
        if (data.success) {
          this.maps = data.maps;
          for (const k of ['2d', '3d']) { this.titles[k] = (data.maps[k] && data.maps[k].title) || ''; this.makeThumb(k); }
        }
      } catch (e) { /* offline: the page still opens, uploads are blocked below */ }
      this.loaded = true;
    },

    // Which format a chosen file is (from its name / type), or null when it isn't allowed for this kind.
    formatOf(file, kind) {
      const name = (file.name || '').toLowerCase();
      let f = null;
      if (/\.obj$/.test(name)) f = 'obj';
      else if (file.type === 'application/pdf' || /\.pdf$/.test(name)) f = 'pdf';
      else if (file.type === 'image/svg+xml' || /\.svg$/.test(name)) f = 'svg';
      else if (file.type === 'image/png') f = 'png';
      else if (file.type === 'image/jpeg') f = 'jpeg';
      else if (file.type === 'image/webp') f = 'webp';
      const allowed = this.kinds.find((k) => k.kind === kind).formats;
      return f && allowed.includes(f) ? f : null;
    },

    readAsDataUrl(blobOrFile) {
      return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(new Error('Could not read the file'));
        r.readAsDataURL(blobOrFile);
      });
    },

    // Pictures are shrunk in the browser so uploads stay quick and phones don't choke on a 12000 px image.
    // SVG, PDF and OBJ are sent exactly as they are.
    async prepare(file, format) {
      if (!['png', 'jpeg', 'webp'].includes(format)) return { dataUrl: await this.readAsDataUrl(file), format };
      const bitmapUrl = URL.createObjectURL(file);
      try {
        const img = await new Promise((resolve, reject) => {
          const i = new Image();
          i.onload = () => resolve(i);
          i.onerror = () => reject(new Error('That file could not be opened as an image'));
          i.src = bitmapUrl;
        });
        const longest = Math.max(img.naturalWidth, img.naturalHeight);
        if (longest <= MAX_SIDE && file.size <= KEEP_AS_IS_BYTES) return { dataUrl: await this.readAsDataUrl(file), format };
        const scale = Math.min(1, MAX_SIDE / longest);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        const ctx = canvas.getContext('2d');
        // JPEG has no transparency: paint white first so a see-through PNG doesn't turn black.
        const keepPng = file.type === 'image/png' && file.size <= 6 * 1024 * 1024 && scale === 1;
        if (!keepPng) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        return { dataUrl: canvas.toDataURL(keepPng ? 'image/png' : 'image/jpeg', 0.9), format: keepPng ? 'png' : 'jpeg' };
      } finally {
        URL.revokeObjectURL(bitmapUrl);
      }
    },

    async pick(kind, event) {
      const file = event.target.files && event.target.files[0];
      event.target.value = '';
      if (!file) return;
      const format = this.formatOf(file, kind);
      if (!format) {
        const allowed = this.kinds.find((k) => k.kind === kind).formats.map((f) => f.toUpperCase()).join(', ');
        Swal.fire({ icon: 'error', title: 'Unsupported file', text: 'A ' + this.kindLabel(kind) + ' can be: ' + allowed + '.' });
        return;
      }
      if (LIMITS[format] && file.size > LIMITS[format] * 1024 * 1024) {
        Swal.fire({ icon: 'error', title: 'File too large', text: 'A ' + format.toUpperCase() + ' map can be up to ' + LIMITS[format] + ' MB.' });
        return;
      }
      if (!(await AdminOffline.guardOnline('Uploading a map'))) return;
      if (this.maps[kind] && !(await AdminConfirm({
        title: 'Replace the ' + this.kindLabel(kind) + '?',
        text: 'Students will see "' + file.name + '" instead of the current map as soon as it uploads. The current file is removed.',
        confirmText: 'Replace map' }))) return;
      this.busy = kind; this.busyText = 'Uploading…';
      try {
        const payload = await this.prepare(file, format);
        const res = await fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind, format: payload.format, image: payload.dataUrl, title: this.titles[kind] || undefined })
        });
        const data = await res.json().catch(() => ({ success: false, error: 'The server sent an unreadable reply (the file may be too big).' }));
        if (!data.success) throw new Error(data.error || 'Upload failed');
        this.maps = { ...this.maps, [kind]: data.map };
        this.titles[kind] = data.map.title || '';
        this.makeThumb(kind);
        Swal.fire({ icon: 'success', title: this.kindLabel(kind) + ' saved', text: 'Students will see it right away.', timer: 1800, showConfirmButton: false });
      } catch (e) {
        Swal.fire({ icon: 'error', title: 'Upload failed', text: e.message || 'unknown' });
      } finally {
        this.busy = null;
      }
    },

    async saveTitle(kind) {
      if (!this.maps[kind]) return;
      if (!AdminOffline.reachable()) return;
      try {
        await fetch(API + '?kind=' + kind, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: this.titles[kind] })
        });
      } catch (e) { /* the next upload or edit will try again */ }
    },

    async remove(kind) {
      const ok = await Swal.fire({
        icon: 'warning',
        title: 'Remove the ' + this.kindLabel(kind) + '?',
        text: 'Students will no longer see it until you upload a new one.',
        showCancelButton: true,
        confirmButtonText: 'Remove',
        confirmButtonColor: '#ff0000'
      });
      if (!ok.isConfirmed) return;
      if (!(await AdminOffline.guardOnline('Removing a map'))) return;
      this.busy = kind; this.busyText = 'Removing…';
      try {
        const res = await fetch(API + '?kind=' + kind, { method: 'DELETE' });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Could not remove');
        this.maps = { ...this.maps, [kind]: null };
        this.titles[kind] = '';
        this.thumbs[kind] = null;
      } catch (e) {
        Swal.fire({ icon: 'error', title: 'Could not remove', text: e.message || 'unknown' });
      } finally {
        this.busy = null;
      }
    },

    kindLabel(kind) { return kind === '2d' ? '2D map' : '3D map'; }
  }
}).mount('#app');
