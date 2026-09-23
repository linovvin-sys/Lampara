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

createApp({
  data() {
    return {
      form: {
        building_id: '', room_number: '', room_name: '', floor: '', category: 'office', hours: '',
        hoursStart: '', hoursEnd: '', hasLunchBreak: false, lunchStart: '', lunchEnd: '',
        hoursDaysPreset: 'Mon–Fri', hoursDaysCustom: '', notes: '', noSignage: false
      },
      buildings: [],
      rooms: [],
      submitting: false,
      editingId: null
    };
  },
  computed: {
    filteredRooms() {
      if (!this.form.building_id) return this.rooms;
      return this.rooms.filter(r => r.building_id == this.form.building_id);
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
      const num = this.form.room_number.trim();
      if (num) {
        const dupe = this.rooms.find((r) => r.room_number === num && r.id !== this.editingId);
        if (dupe) return `Room ${num} is already registered (${dupe.room_name}, ${dupe.building_name}).`;
      }
      if (!this.expectedPrefix || !this.form.room_number) return '';
      if (!/^\d+$/.test(num)) return 'Room number should be digits only.';
      if (!num.startsWith(this.expectedPrefix)) {
        return `Doesn't match this building/floor — expected it to start with ${this.expectedPrefix}.`;
      }
      return '';
    }
  },
  mounted() { this.loadBuildings(); this.loadRooms(); },
  methods: {
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
    async loadBuildings() {
      const res = await fetch('../../../Backend/api/buildings.php');
      const data = await res.json();
      if (data.success) this.buildings = data.buildings;
    },
    async loadRooms() {
      const res = await fetch('../../../Backend/api/rooms.php');
      const data = await res.json();
      if (data.success) this.rooms = data.rooms;
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
        building_id: r.building_id, room_number: r.room_number || '', room_name: r.room_name,
        floor: r.floor, category: r.category || r.room_type || 'office', hours: hours,
        hoursStart, hoursEnd, hasLunchBreak, lunchStart, lunchEnd,
        hoursDaysPreset, hoursDaysCustom: hoursDaysPreset === 'Custom' ? dayPart : '',
        notes: r.notes || '', noSignage: !r.room_number
      };
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    // Shared shape for "reset the form" — overrides lets callers keep
    // whatever context makes sense for the situation (e.g. building_id when
    // cancelling an edit, or building_id + room_type + floor when batching
    // in several similar rooms back to back via "Add another?").
    blankForm(overrides) {
      return {
        building_id: '', room_number: '', room_name: '', floor: '', category: 'office', hours: '',
        hoursStart: '', hoursEnd: '', hasLunchBreak: false, lunchStart: '', lunchEnd: '',
        hoursDaysPreset: 'Mon–Fri', hoursDaysCustom: '', notes: '', noSignage: false, ...overrides
      };
    },
    cancelEdit() {
      this.editingId = null;
      this.form = this.blankForm({ building_id: this.form.building_id });
    },
    async submitRoom() {
      this.submitting = true;
      const wasAdding = !this.editingId; // captured before cancelEdit() clears it
      try {
        const url = this.editingId ? '../../../Backend/api/rooms.php?id=' + this.editingId : '../../../Backend/api/rooms.php';
        const method = this.editingId ? 'PUT' : 'POST';
        const payload = { ...this.form, hours: this.composedHours, room_number: (this.form.noSignage || this.forcesNoNumber) ? '' : this.form.room_number };
        const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await res.json();
        if (data.success) {
          const justAdded = { building_id: this.form.building_id, category: this.form.category, floor: this.form.floor };
          this.cancelEdit();
          await this.loadRooms();
          // Only after adding a NEW room (not editing one) — "add another?"
          // doesn't make sense mid-edit. Keeping building/type/floor on yes
          // is what actually fixes "it resets to Office every time": you're
          // usually adding several similar rooms back to back (e.g. a run
          // of classrooms on the same floor), not starting from scratch
          // each time.
          if (wasAdding) {
            const result = await Swal.fire({
              icon: 'success',
              title: 'Room added',
              text: 'Add another room?',
              showCancelButton: true,
              confirmButtonText: 'Yes, add another',
              cancelButtonText: 'Done',
              confirmButtonColor: '#16a34a'
            });
            if (result.isConfirmed) {
              this.form = this.blankForm(justAdded);
            }
          }
        } else {
          Swal.fire({ icon: 'error', title: 'Error', text: data.error || 'unknown' });
        }
      } finally {
        this.submitting = false;
      }
    },
    async deleteRoom(r) {
      const result = await Swal.fire({
        title: `Delete Room ${r.room_number} — ${r.room_name}?`,
        text: "This can't be undone.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Delete',
        confirmButtonColor: '#dc2626',
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
}).mount('#app');
