(function () {
const { createApp } = Vue;

// "08:00" (native <input type="time"> value) -> "8:00 AM", matching the
// existing stored format ("8:00 AM – 5:00 PM, Mon–Fri").
function to12Hour(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}
// Reverse, best-effort — for pre-filling the time pickers when editing a
// room whose hours were typed as free text before this picker existed.
// Not guaranteed to match every possible phrasing; if it doesn't parse,
// the pickers just start blank and the admin re-enters it once, cleanly.
function parse12Hour(s) {
  const m = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(s || '');
  if (!m) return '';
  let h = parseInt(m[1], 10) % 12;
  if (/PM/i.test(m[3])) h += 12;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

window.LamparaRoomApp = createApp({
  data() {
    return {
      form: {
        building_id: '', room_number: '', room_name: '', subtitle: '', floor: '', category: 'office', hours: '',
        hoursStart: '', hoursEnd: '', hasLunchBreak: false, lunchStart: '', lunchEnd: '',
        hoursDaysPreset: 'Mon–Fri', hoursDaysCustom: '', notes: '', noSignage: false,
        map_x: null, map_y: null
      },
      snap: '',           // the form as last saved / loaded (unsaved-changes detection)
      prevBuilding: '',   // building before the last dropdown change, so a cancelled switch can go back
      baseBuildings: [],  // last data from the server
      baseRooms: [],
      buildings: [],      // server data + changes made offline (shown on the page)
      rooms: [],
      submitting: false,
      editingId: null,
      // The uploaded plan image for whichever building+floor is currently
      // selected — null whenever that floor has none, which just hides the
      // marker-placement UI (map_x/map_y stay null, room falls back to
      // text-only directions on the scan result screen).
      currentFloorPlan: null,
      loadingPlan: false,
      planUnavailable: false, // couldn't load the plan (offline and never opened online)
      planForNewBuilding: false, // the picked building was made offline and has no plans yet
      roomQuery: '',
      viewMode: 'list',            // 'list' or 'plan' (rooms drawn on the floor plan)
      plans: [],                   // the selected building's floor plans
      planFloor: '',
      planLoading: false,
      placing: false,              // next click on the plan places this room's marker
      selectMode: false,           // checkboxes on the room list
      selected: [],
      bulk: { open: false, busy: false, start: '08:00', end: '17:00', days: 'Mon–Fri' },
      photoBusy: false,
      photoOver: false,
      loaded: false,
      nameOther: false,          // "Something else — type a name" picked in the Room name dropdown
      classroomTypes: ['Lecture Room', 'Laboratory Room'],
      otherRoomTypes: ['Kubo', 'Cubicle', 'Church']   // ready-made choices for rooms that are not a lecture room or lab
    };
  },
  computed: {
    // What the Room name dropdown shows. A saved name that is not one of the ready-made choices (typed by hand
    // earlier, or an older room) shows as "Something else" with its name in the box beside it.
    nameChoice: {
      get() {
        const n = this.form.room_name;
        if (this.classroomTypes.includes(n) || this.otherRoomTypes.includes(n)) return n;
        return (this.nameOther || n) ? '__other__' : '';
      },
      set(v) {
        if (v === '__other__') { this.nameOther = true; this.form.room_name = ''; }
        else { this.nameOther = false; this.form.room_name = v; }
      }
    },
    filteredRooms() {
      if (!this.form.building_id) return this.rooms;
      return this.rooms.filter(r => r.building_id == this.form.building_id);
    },
    // Every OTHER room already pinned on this same building+floor — shown as
    // fixed reference dots on the plan so an admin placing a new marker can
    // see what's already occupied instead of guessing blind or stacking two
    // rooms on the same spot.
    occupiedPins() {
      if (!this.form.building_id || !this.form.floor) return [];
      return this.rooms.filter((r) =>
        r.building_id == this.form.building_id &&
        r.floor === this.form.floor &&
        r.id !== this.editingId &&
        r.map_x !== null && r.map_y !== null
      );
    },
    // The building choice itself is not an edit: switching buildings is guarded separately.
    dirtyView() { return { ...this.form, building_id: null }; },
    dirty() { return JSON.stringify(this.dirtyView) !== this.snap; },
    editingRoom() { return this.editingId === null ? null : (this.rooms.find((r) => r.id === this.editingId) || null); },
    // Rooms of the selected building for the Room dropdown, by floor then room number.
    buildingRooms() {
      if (!this.form.building_id) return [];
      const floorNo = (f) => { const n = parseInt(f, 10); return isFinite(n) ? n : 99; };
      return this.rooms
        .filter((r) => r.building_id == this.form.building_id)
        .slice()
        .sort((a, b) => floorNo(a.floor) - floorNo(b.floor) || String(a.room_number || '~').localeCompare(String(b.room_number || '~'), undefined, { numeric: true }));
    },
    // The room list on the left, narrowed by the search box.
    // ---- photo ----
    roomPhoto() { return this.editingRoom && this.editingRoom.photo_path ? this.editingRoom.photo_path : ''; },
    editingIsTemp() { return this.editingId !== null && AdminOffline.isTemp(this.editingId); },
    // ---- the student preview ----
    categoryLabel() { return { office: 'Office', classroom: 'Classroom / Lab', cr: 'Comfort room', canteen: 'Canteen' }[this.form.category] || 'Room'; },
    previewNumber() { return (this.form.noSignage || this.forcesNoNumber) ? '' : this.roomNumberNormalized; },
    // ---- floor plan view ----
    planFloors() {
      const n = (f) => { const v = parseInt(f, 10); return isFinite(v) ? v : 99; };
      return this.plans.map((p) => p.floor).sort((a, b) => n(a) - n(b));
    },
    planImage() { return this.plans.find((p) => p.floor === this.planFloor) || null; },
    // Markers on the shown floor. The room being edited follows the form, so moving it is visible straight away.
    planPins() {
      const pins = [];
      this.buildingRooms.forEach((r) => {
        if (r.floor !== this.planFloor) return;
        const cur = this.editingId === r.id;
        const x = cur ? this.form.map_x : r.map_x, y = cur ? this.form.map_y : r.map_y;
        if (x === null || x === undefined || y === null || y === undefined) return;
        pins.push({ id: r.id, x, y, cur, short: r.room_number || '•', label: (r.room_number ? r.room_number + ' ' : '') + (r.room_name || 'Unnamed') + (cur ? ' (editing)' : '') });
      });
      if (this.editingId === null && this.form.floor === this.planFloor && this.form.map_x !== null && this.form.map_y !== null) {
        pins.push({ id: 'new', x: this.form.map_x, y: this.form.map_y, cur: true, short: 'New', label: 'The new room' });
      }
      return pins;
    },
    unplacedOnFloor() {
      return this.buildingRooms.filter((r) => r.floor === this.planFloor && (r.map_x === null || r.map_x === undefined)).length;
    },
    visibleRooms() {
      const q = this.roomQuery.trim().toLowerCase();
      if (!q) return this.buildingRooms;
      return this.buildingRooms.filter((r) => [r.room_number, r.room_name, r.floor].some((v) => String(v || '').toLowerCase().includes(q)));
    },
    floorOptions() {
      const b = this.buildings.find(x => x.id == this.form.building_id);
      const count = b ? (b.floor_count || 1) : 0;
      const ordinal = (n) => {
        const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
      };
      return Array.from({ length: count }, (_, i) => `${ordinal(i + 1)} Floor`);
    },
    selectedBuilding() {
      return this.buildings.find(x => x.id == this.form.building_id) || null;
    },
    // A building with no building_number (set on Register Building) was
    // explicitly marked as having no numbered rooms at all — e.g. the
    // Gymnasium, which is just a court. Reuses that existing signal instead
    // of adding a new column for the same fact.
    buildingBlocksRooms() {
      const b = this.selectedBuilding;
      return !!b && (b.building_number === null || b.building_number === undefined);
    },
    // CRs and canteens are never numbered — this isn't just a default, it's
    // a hard rule: unlike offices/classrooms (which sometimes genuinely
    // have no signage as an edge case), a CR having a room number would be
    // actively wrong, so the checkbox is removed entirely for these two
    // rather than left togglable.
    forcesNoNumber() {
      return this.form.category === 'cr' || this.form.category === 'canteen';
    },
    // Offices and canteens have real operating hours; classrooms and CRs
    // don't (class scheduling is a separate scope; a CR is never "open").
    categoryHasHours() {
      return this.form.category === 'office' || this.form.category === 'canteen';
    },
    hoursDaysValue() {
      return this.form.hoursDaysPreset === 'Custom' ? this.form.hoursDaysCustom.trim() : this.form.hoursDaysPreset;
    },
    // What actually gets saved as `hours`. With a lunch break, this splits
    // into two time ranges ("8:00 AM – 12:00 PM, 1:00 PM – 5:00 PM,
    // Mon–Fri") — the rest of the app (chat grounding, result cards) just
    // treats `hours` as one opaque display string either way, so this format
    // needed no changes downstream to support it.
    composedHours() {
      if (!this.form.hoursStart || !this.form.hoursEnd) return '';
      const days = this.hoursDaysValue;
      let timePart;
      if (this.form.hasLunchBreak && this.form.lunchStart && this.form.lunchEnd) {
        timePart = `${to12Hour(this.form.hoursStart)} – ${to12Hour(this.form.lunchStart)}, ${to12Hour(this.form.lunchEnd)} – ${to12Hour(this.form.hoursEnd)}`;
      } else {
        timePart = `${to12Hour(this.form.hoursStart)} – ${to12Hour(this.form.hoursEnd)}`;
      }
      return timePart + (days ? `, ${days}` : '');
    },
    floorDigit() {
      const n = parseInt(this.form.floor, 10);
      return isFinite(n) ? n : null;
    },
    // Null whenever we can't compute one yet (no building number registered,
    // or no floor picked) — the room number field just falls back to free
    // text in that case, no forced format.
    expectedPrefix() {
      const b = this.selectedBuilding;
      if (!b || b.building_number === null || b.building_number === undefined) return null;
      if (this.floorDigit === null) return null;
      return String(b.building_number) + String(this.floorDigit);
    },
    roomNumberError() {
      if (this.form.noSignage || this.forcesNoNumber) return ''; // nothing to validate — this room deliberately has no number
      // Duplicate check runs regardless of whether a numbering prefix is
      // established — room_number is looked up globally, with no building
      // filter, by both signage scanning (exact match) and destination
      // search (r.id === ...), so two rooms sharing a number is a real
      // data-integrity bug, not just a display inconvenience: scanning
      // either sign would resolve to whichever row the query happens to
      // return first, silently showing the wrong room.
      // "1101-a", "1101 A" and "1101 - A" are the same room number: compare the way
      // the server does (ignoring case, spaces and dashes), so a duplicate can't slip in
      // just by typing it differently.
      const num = this.roomNumberNormalized;
      if (num) {
        const key = RoomNumber.compact(num);
        const dupe = this.rooms.find((r) => r.room_number && RoomNumber.compact(r.room_number) === key && r.id !== this.editingId);
        if (dupe) return `Room ${num} is already registered (${dupe.room_name}, ${dupe.building_name}).`;
      }
      if (!this.expectedPrefix || !num) return '';
      if (!RoomNumber.isValidFormat(num)) return 'Room number should be digits, optionally followed by a section, like 1101 or 1101 - A.';
      if (!RoomNumber.base(num).startsWith(this.expectedPrefix)) {
        return `Doesn't match this building/floor — expected it to start with ${this.expectedPrefix}.`;
      }
      return '';
    },
    // What actually gets saved: "1101-a" -> "1101 - A".
    roomNumberNormalized() {
      return RoomNumber.normalize(this.form.room_number);
    },
    // Shown under the field only when saving would change what was typed.
    roomNumberPreview() {
      const n = this.roomNumberNormalized;
      return n && n !== this.form.room_number.trim() ? n : '';
    }
  },
  async mounted() {
    this.markClean();
    window.addEventListener('beforeunload', (e) => { if (this.dirty) { e.preventDefault(); e.returnValue = ''; } });
    AdminOffline.onSynced(() => this.loadAll());
    AdminOffline.onChange(() => this.applyPending());
    await this.loadAll();
    this.loaded = true;
    // Links from the buildings list and the dashboard carry context: ?building=<id> and ?room=<id>.
    const q = new URLSearchParams(window.location.search);
    const bid = q.get('building'), rid = q.get('room');
    const room = rid ? this.rooms.find((r) => String(r.id) === rid) : null;
    const building = room ? this.buildings.find((b) => b.id == room.building_id) : (bid ? this.buildings.find((b) => String(b.id) === bid) : null);
    // No link context: reopen the building you were last working in (or the only one there is), instead of an empty page.
    let start = building;
    if (!start && !room) {
      let last = null;
      try { last = localStorage.getItem('lampara_last_building'); } catch (e) { /* storage blocked */ }
      start = this.buildings.find((b) => String(b.id) === last) || (this.buildings.length === 1 ? this.buildings[0] : null);
    }
    if (start) { this.form.building_id = start.id; this.prevBuilding = start.id; this.markClean(); }
    if (room) this.startEdit(room);
  },
  watch: {
    form() { this.nameOther = false; },   // a new form (edit, reset, other building) starts without a half-picked "something else"
    'form.building_id'(id) { try { if (id) localStorage.setItem('lampara_last_building', String(id)); } catch (e) { /* storage blocked */ }
       this.loadFloorPlanForCurrentSelection(); this.selected = []; this.placing = false; this.loadBuildingPlans(); },
    editingId() { if (this.editingRoom) this.planFloor = this.editingRoom.floor; this.placing = false; },
    'form.floor'() { this.loadFloorPlanForCurrentSelection(); }
  },
  methods: {
    // True when it is OK to throw away what is on the form (nothing changed, or the admin agreed).
    async confirmDiscard() {
      if (!this.dirty) return true;
      const r = await Swal.fire({
        icon: 'warning', title: 'Discard your changes?', text: 'You have unsaved changes on this form.',
        showCancelButton: true, confirmButtonText: 'Discard', cancelButtonText: 'Keep editing',
        confirmButtonColor: '#ff0000', cancelButtonColor: '#55556b', reverseButtons: true
      });
      return r.isConfirmed;
    },
    markClean() { this.snap = JSON.stringify(this.dirtyView); },
    async tryCancel() {
      if (!(await this.confirmDiscard())) return;
      this.cancelEdit();
    },
    async loadFloorPlanForCurrentSelection() {
      // Switching building/floor invalidates whatever marker position was
      // showing — it belonged to the previous floor's image, not this one.
      this.currentFloorPlan = null;
      this.planUnavailable = false;
      this.planForNewBuilding = false;
      if (!this.form.building_id || !this.form.floor) return;
      // A building made offline has no plans yet.
      if (AdminOffline.isTemp(this.form.building_id)) { this.planForNewBuilding = true; return; }
      this.loadingPlan = true;
      try {
        // All of the building's plans in one request (the same one the offline
        // copy is saved under), then pick this floor's.
        const res = await fetch(`../../../Backend/api/floor-plans.php?building_id=${this.form.building_id}`, { credentials: 'same-origin' });
        const data = await res.json();
        if (data.success) this.currentFloorPlan = data.plans.find((p) => p.floor === this.form.floor) || null;
      } catch (e) {
        this.planUnavailable = true;
      } finally {
        this.loadingPlan = false;
      }
    },
    // Percentage of the image's own rendered size, not raw pixels — stays
    // correct regardless of what size the image actually renders at on
    // whatever device later reads it back (scan.php).
    placeMarker(event) {
      const rect = event.currentTarget.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 100;
      const y = ((event.clientY - rect.top) / rect.height) * 100;
      this.form.map_x = Math.round(Math.max(0, Math.min(100, x)) * 10) / 10;
      this.form.map_y = Math.round(Math.max(0, Math.min(100, y)) * 10) / 10;
    },
    clearMarker() {
      this.form.map_x = null;
      this.form.map_y = null;
    },
    // Switching category resets room_name — a typed office name like
    // "Treasury" isn't valid once the field becomes a Lecture/Laboratory
    // dropdown (classroom), and vice versa. CR/canteen get a sensible
    // default name (still editable) and default to "no signage" since
    // that's true for most real CRs/canteens — admins can uncheck it if
    // theirs actually has a number.
    setCategory(cat) {
      if (this.form.category !== cat) {
        if (cat === 'cr') { this.form.room_name = 'Comfort Room'; this.form.noSignage = true; }
        else if (cat === 'canteen') { this.form.room_name = 'Canteen'; this.form.noSignage = true; }
        else { this.form.room_name = ''; this.form.noSignage = false; }
      }
      this.form.category = cat;
    },
    async loadAll() {
      await this.loadBuildings();
      await this.loadRooms();
    },
    // Shows the last server data with any pending offline changes laid on top.
    applyPending() {
      this.buildings = AdminOffline.overlayBuildings(this.baseBuildings);
      this.rooms = AdminOffline.overlayRooms(this.baseRooms, this.buildings);
    },
    async loadBuildings() {
      try {
        const res = await fetch('../../../Backend/api/buildings.php', { credentials: 'same-origin' });
        const data = await res.json();
        if (data.success) this.baseBuildings = data.buildings;
      } catch (e) { /* offline with no saved copy — pending changes still show */ }
      this.applyPending();
    },
    async loadRooms() {
      try {
        const res = await fetch('../../../Backend/api/rooms.php', { credentials: 'same-origin' });
        const data = await res.json();
        if (data.success) this.baseRooms = data.rooms;
      } catch (e) { /* offline with no saved copy */ }
      this.applyPending();
    },
    startEdit(r) {
      this.editingId = r.id;
      // Best-effort split of "8:00 AM – 5:00 PM, Mon–Fri" (or, with a lunch
      // break, "8:00 AM – 12:00 PM, 1:00 PM – 5:00 PM, Mon–Fri") back into
      // the pickers. Comma-separated parts containing an AM/PM time are
      // time ranges; whatever's left is the days label. A string typed
      // before this picker existed (or shaped some other way entirely)
      // just leaves the pickers blank rather than showing something wrong
      // — re-entering once via the picker is a fine trade for structured
      // data going forward.
      const hours = r.hours || '';
      const parts = hours.split(',').map((s) => s.trim()).filter(Boolean);
      const timeParts = parts.filter((p) => /AM|PM/i.test(p));
      const dayPart = parts.filter((p) => !/AM|PM/i.test(p)).join(', ');

      let hoursStart = '', hoursEnd = '', hasLunchBreak = false, lunchStart = '', lunchEnd = '';
      if (timeParts.length >= 2) {
        const [m1, m2] = timeParts[0].split(/[–-]/);
        const [a1, a2] = timeParts[1].split(/[–-]/);
        hoursStart = parse12Hour(m1); lunchStart = parse12Hour(m2);
        lunchEnd = parse12Hour(a1); hoursEnd = parse12Hour(a2);
        hasLunchBreak = true;
      } else if (timeParts.length === 1) {
        const [s1, s2] = timeParts[0].split(/[–-]/);
        hoursStart = parse12Hour(s1); hoursEnd = parse12Hour(s2);
      }

      const presets = ['Mon–Fri', 'Mon–Sat', 'Daily'];
      const hoursDaysPreset = presets.includes(dayPart) ? dayPart : (dayPart ? 'Custom' : 'Mon–Fri');

      this.form = {
        building_id: r.building_id, room_number: r.room_number || '', room_name: r.room_name, subtitle: r.subtitle || '',
        floor: r.floor, category: r.category || r.room_type || 'office', hours: hours,
        hoursStart, hoursEnd, hasLunchBreak, lunchStart, lunchEnd,
        hoursDaysPreset, hoursDaysCustom: hoursDaysPreset === 'Custom' ? dayPart : '',
        notes: r.notes || '', noSignage: !r.room_number,
        map_x: r.map_x, map_y: r.map_y
      };
      this.prevBuilding = this.form.building_id;
      this.markClean();
      this.loadFloorPlanForCurrentSelection();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    // Shared shape for "reset the form" — overrides lets callers keep
    // whatever context makes sense for the situation (e.g. building_id when
    // cancelling an edit, or building_id + room_type + floor when batching
    // in several similar rooms back to back via "Add another?").
    blankForm(overrides) {
      return {
        building_id: '', room_number: '', room_name: '', subtitle: '', floor: '', category: 'office', hours: '',
        hoursStart: '', hoursEnd: '', hasLunchBreak: false, lunchStart: '', lunchEnd: '',
        hoursDaysPreset: 'Mon–Fri', hoursDaysCustom: '', notes: '', noSignage: false,
        map_x: null, map_y: null, ...overrides
      };
    },
    cancelEdit() {
      this.editingId = null;
      this.form = this.blankForm({ building_id: this.form.building_id });
      this.prevBuilding = this.form.building_id;
      this.markClean();
    },
    // "1101 · Computer Lab · 1st Floor" (rooms without a number, like CRs, just show their name).
    roomOptionLabel(r) {
      return (r.room_number ? r.room_number + ' · ' : '') + (r.room_name || 'Unnamed') + (r.floor ? ' · ' + r.floor : '');
    },
    // Building dropdown: moving to another building leaves any edit and starts a fresh room there.
    async onBuildingChange() {
      const building_id = this.form.building_id;
      if (!(await this.confirmDiscard())) { this.form.building_id = this.prevBuilding; return; }
      this.editingId = null;
      this.form = this.blankForm({ building_id });
      this.prevBuilding = building_id;
      this.markClean();
    },
    // Room dropdown: a room loads it for editing; the first option goes back to adding a new one.
    // ---- floor plan view ----
    setView(mode) { this.viewMode = mode; this.placing = false; if (mode === 'plan') this.loadBuildingPlans(); },
    async loadBuildingPlans() {
      this.plans = [];
      if (!this.form.building_id || AdminOffline.isTemp(this.form.building_id)) return;
      const id = this.form.building_id;
      this.planLoading = true;
      try {
        const res = await fetch('../../../Backend/api/floor-plans.php?building_id=' + id, { credentials: 'same-origin' });
        const data = await res.json();
        if (this.form.building_id !== id) return;   // the building changed while this was loading
        if (data.success) this.plans = data.plans;
      } catch (e) { /* offline: the plan view just says there is no plan */ }
      finally { this.planLoading = false; }
      if (!this.planFloors.includes(this.planFloor)) {
        this.planFloor = (this.editingRoom && this.planFloors.includes(this.editingRoom.floor)) ? this.editingRoom.floor : (this.planFloors[0] || '');
      }
    },
    planPin(p) { if (p.id !== 'new') this.pickRoom(p.id); },
    planClick(event) {
      if (!this.placing) return;
      if (this.editingId !== null && this.form.floor !== this.planFloor) {
        AdminOffline.toast('This room is on ' + this.form.floor + '. Switch to that floor to move its marker.', 'info');
        return;
      }
      const rect = event.currentTarget.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 100, y = ((event.clientY - rect.top) / rect.height) * 100;
      if (this.editingId === null) this.form.floor = this.planFloor;   // a new room goes on the floor you are looking at
      this.form.map_x = Math.round(Math.max(0, Math.min(100, x)) * 10) / 10;
      this.form.map_y = Math.round(Math.max(0, Math.min(100, y)) * 10) / 10;
      this.placing = false;
      AdminOffline.toast('Marker placed. Press Save on the room to keep it.', 'success');
    },
    // ---- photo ----
    async choosePhoto(file) {
      if (this.editingId === null || this.editingIsTemp) return;
      if (!(await AdminOffline.guardOnline('Uploading a photo'))) return;
      const data = await LamparaPhoto.pick({ title: 'Photo of ' + (this.form.room_name || 'the room'), file, portrait: true });
      if (!data) return;
      this.photoBusy = true;
      try {
        await LamparaPhoto.upload('room', this.editingId, data);
        await this.loadRooms();
        AdminOffline.toast('Photo saved', 'success');
      } catch (e) {
        Swal.fire({ icon: 'error', title: "Couldn't save the photo", text: e.message });
      } finally { this.photoBusy = false; }
    },
    dropPhoto(ev) {
      this.photoOver = false;
      const f = ev.dataTransfer && ev.dataTransfer.files[0];
      if (f) this.choosePhoto(f);
    },
    async removePhoto() {
      if (!(await AdminOffline.guardOnline('Removing a photo'))) return;
      if (!(await AdminConfirm({ title: 'Remove this photo?', text: 'Students will see no photo for this room.', confirmText: 'Remove photo', danger: true }))) return;
      this.photoBusy = true;
      try { await LamparaPhoto.remove('room', this.editingId); await this.loadRooms(); }
      catch (e) { Swal.fire({ icon: 'error', title: "Couldn't remove the photo", text: e.message }); }
      finally { this.photoBusy = false; }
    },
    // ---- select several rooms ----
    isSelected(id) { return this.selected.includes(id); },
    toggleSelected(id) { this.selected = this.isSelected(id) ? this.selected.filter((x) => x !== id) : [...this.selected, id]; },
    toggleSelectMode() { this.selectMode = !this.selectMode; this.selected = []; this.bulk.open = false; },
    selectAllShown() { this.selected = this.visibleRooms.filter((r) => !r._pending).map((r) => r.id); },
    async bulkSetHours() {
      if (!(await AdminOffline.guardOnline('Changing several rooms'))) return;
      const hours = `${to12Hour(this.bulk.start)} – ${to12Hour(this.bulk.end)}, ${this.bulk.days}`;
      const rooms = this.rooms.filter((r) => this.selected.includes(r.id));
      const eligible = rooms.filter((r) => r.category === 'office' || r.category === 'canteen');
      const skipped = rooms.length - eligible.length;
      if (!eligible.length) { AdminOffline.toast('None of the selected rooms have fixed hours (only offices and canteens do).', 'info'); return; }
      if (!(await AdminConfirm({
        icon: 'question', title: 'Set hours for ' + eligible.length + ' room' + (eligible.length === 1 ? '' : 's') + '?',
        text: hours + (skipped ? '. ' + skipped + ' other room' + (skipped === 1 ? ' is' : 's are') + ' left unchanged.' : ''), confirmText: 'Set hours' }))) return;
      this.bulk.busy = true;
      let ok = 0, failed = 0;
      for (const r of eligible) {
        try {
          const res = await fetch('../../../Backend/api/rooms.php?id=' + r.id, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
            body: JSON.stringify({ room_number: r.room_number, room_name: r.room_name, floor: r.floor, category: r.category, hours, notes: r.notes, map_x: r.map_x, map_y: r.map_y, path_node_id: r.path_node_id })
          });
          const data = await res.json();
          if (data.success) ok++; else failed++;
        } catch (e) { failed++; }
      }
      this.bulk.busy = false; this.bulk.open = false;
      await this.loadRooms();
      if (this.editingRoom) this.startEdit(this.editingRoom);
      AdminOffline.toast('Hours set for ' + ok + ' room' + (ok === 1 ? '' : 's') + (failed ? ', ' + failed + ' failed' : '') + '.', failed ? 'error' : 'success');
    },
    async bulkDelete() {
      if (!(await AdminOffline.guardOnline('Deleting rooms'))) return;
      const n = this.selected.length;
      if (!(await AdminConfirm({ title: 'Delete ' + n + ' room' + (n === 1 ? '' : 's') + '?', text: 'Students will no longer find them by sign or search. This can\'t be undone.', confirmText: 'Delete ' + n + ' room' + (n === 1 ? '' : 's'), danger: true }))) return;
      this.bulk.busy = true;
      let failed = 0;
      for (const id of [...this.selected]) {
        try {
          const res = await fetch('../../../Backend/api/rooms.php?id=' + id, { method: 'DELETE', credentials: 'same-origin' });
          const data = await res.json();
          if (!data.success) failed++;
        } catch (e) { failed++; }
      }
      if (this.editingId !== null && this.selected.includes(this.editingId)) this.cancelEdit();
      this.selected = []; this.bulk.busy = false;
      await this.loadRooms();
      AdminOffline.toast(failed ? failed + ' room(s) could not be deleted.' : 'Rooms deleted.', failed ? 'error' : 'success');
    },
    // "+ Add a room": back to a blank form for the chosen building (asks first if there are unsaved edits).
    async newRoom() {
      if (!(await this.confirmDiscard())) return;
      this.cancelEdit();
    },
    async pickRoom(value, el) {
      if (!(await this.confirmDiscard())) { if (el) el.value = this.editingId === null ? '' : this.editingId; return; }
      if (value === '') { this.cancelEdit(); return; }
      const r = this.rooms.find((x) => String(x.id) === String(value));
      if (r) this.startEdit(r);
    },
    // Saves to the server when it's reachable; otherwise keeps the change on this
    // device (AdminOffline) to be synced later with the admin's approval.
    async submitRoom() {
      this.submitting = true;
      const editing = this.editingId;
      const wasAdding = !editing; // captured before cancelEdit() clears it
      const fields = {
        room_number: (this.form.noSignage || this.forcesNoNumber) ? '' : this.roomNumberNormalized,
        room_name: this.form.room_name, subtitle: (this.form.subtitle || '').trim(), floor: this.form.floor, category: this.form.category,
        hours: this.composedHours, notes: this.form.notes, map_x: this.form.map_x, map_y: this.form.map_y
      };
      const seen = editing ? this.baseRooms.find((x) => String(x.id) === String(editing)) : null;
      const label = `${wasAdding ? 'New' : 'Edited'} room ${fields.room_number ? fields.room_number + ' ' : ''}"${fields.room_name}"`;
      const op = editing
        ? { type: 'room.update', payload: { id: editing, ...fields, base_updated_at: seen ? seen.updated_at : null }, label }
        : { type: 'room.create', payload: { temp_id: AdminOffline.newTempId(), building_id: this.form.building_id, ...fields }, label };
      try {
        const out = await AdminOffline.run(op, async () => {
          const path = editing ? 'rooms.php?id=' + editing : 'rooms.php';
          const body = editing ? fields : { building_id: this.form.building_id, ...fields };
          const data = await AdminOffline.fetchJson(path, { method: editing ? 'PUT' : 'POST', body: JSON.stringify(body) });
          if (!data.success) throw new Error(data.error || 'unknown');
          return data;
        });
        const justAdded = { building_id: this.form.building_id, category: this.form.category, floor: this.form.floor };
        this.cancelEdit();
        if (out.queued) this.applyPending(); else await this.loadRooms();
        // Only after adding a NEW room (not editing one) — "add another?"
        // doesn't make sense mid-edit. Keeping building/type/floor on yes
        // is what actually fixes "it resets to Office every time": you're
        // usually adding several similar rooms back to back (e.g. a run
        // of classrooms on the same floor), not starting from scratch
        // each time.
        if (wasAdding) {
          const result = await Swal.fire({
            icon: out.queued ? 'info' : 'success',
            title: out.queued ? 'Saved on this device' : 'Room added',
            text: out.queued ? "It will be offered for sync when you're back online. Add another room?" : 'Add another room?',
            showCancelButton: true,
            confirmButtonText: 'Yes, add another',
            cancelButtonText: 'Done',
            confirmButtonColor: '#2e3192'
          });
          if (result.isConfirmed) { this.form = this.blankForm(justAdded); this.markClean(); }
        } else if (out.queued) {
          AdminOffline.toast("Saved on this device. You'll be asked to sync when you're back online.", 'info');
        }
      } catch (e) {
        Swal.fire({ icon: 'error', title: 'Error', text: e.message || 'unknown' });
      } finally {
        this.submitting = false;
      }
    },
    async deleteRoom(r) {
      if (!(await AdminOffline.guardOnline('Deleting a room'))) return;
      const result = await Swal.fire({
        title: `Delete Room ${r.room_number} — ${r.room_name}?`,
        text: "This can't be undone.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Delete',
        confirmButtonColor: '#ff0000',
        cancelButtonColor: '#6b7280'
      });
      if (!result.isConfirmed) return;
      const res = await fetch('../../../Backend/api/rooms.php?id=' + r.id, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        await this.loadRooms();
        if (this.editingId === r.id) this.cancelEdit();
      } else {
        Swal.fire({ icon: 'error', title: 'Error', text: data.error || 'unknown' });
      }
    }
  }
}).mount('#room-app');
})();
