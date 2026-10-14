// "Report a problem": a visitor photographs a closed building or a blocked path with the live camera and sends it.
// The report is shown to everyone through the hazard feed (Js/Include/hazard-feed.js) and to the admins (Admin → Reports).
(() => {
  const API = '../../../Backend/api/';
  const MAX_SIDE = 1280;           // photos are shrunk before sending: a phone photo is several MB, a report needs a few hundred KB
  const $ = (id) => document.getElementById(id);
  let kind = null, stream = null, photo = null, pos = null, buildings = [];

  function show(id) {
    ['s1', 's2', 's3', 's4'].forEach((s) => { $(s).hidden = s !== id; });
    window.scrollTo(0, 0);
  }

  // ---------------- 1. kind
  document.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => {
    kind = b.dataset.kind;
    show('s2');
    openCamera();
  }));

  // ---------------- 2. photo
  async function openCamera() {
    stopCamera();
    $('video').hidden = false; $('shot').hidden = true; $('nocam').hidden = true;
    $('snap').hidden = false; $('retake').hidden = true; $('toDetails').hidden = true;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      $('video').srcObject = stream;
    } catch (e) {
      $('video').hidden = true; $('nocam').hidden = false; $('snap').hidden = true;
    }
  }
  function stopCamera() {
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
  }
  function setPhoto(dataUrl) {
    photo = dataUrl;
    $('shot').src = dataUrl; $('shot').hidden = false; $('video').hidden = true; $('nocam').hidden = true;
    $('snap').hidden = true; $('retake').hidden = false; $('toDetails').hidden = false;
    stopCamera();
  }
  // Draws a frame or a picked file onto a canvas no bigger than MAX_SIDE and returns it as a JPEG data URL.
  function toJpeg(source, w, h) {
    const k = Math.min(1, MAX_SIDE / Math.max(w, h));
    const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
    c.getContext('2d').drawImage(source, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.8);
  }
  $('snap').onclick = () => {
    const v = $('video');
    if (!v.videoWidth) return;
    setPhoto(toJpeg(v, v.videoWidth, v.videoHeight));
  };
  $('retake').onclick = () => { photo = null; openCamera(); };
  $('file').onchange = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const url = URL.createObjectURL(f), img = new Image();
    img.onload = () => { setPhoto(toJpeg(img, img.naturalWidth, img.naturalHeight)); URL.revokeObjectURL(url); };
    img.src = url;
  };
  $('toDetails').onclick = toDetails;
  $('skipPhoto').onclick = () => { photo = null; stopCamera(); toDetails(); };

  // ---------------- 3. where
  const dist = (a, b) => {
    const R = 6371008.8, r = (d) => d * Math.PI / 180, dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  };
  async function toDetails() {
    show('s3');
    try {
      const d = await (await fetch(API + 'buildings.php')).json();
      buildings = d.success ? d.buildings : [];
    } catch (e) { buildings = []; }
    $('bld').innerHTML = '<option value="">Not at a building (on the walkway)</option>' + buildings.map((b) => '<option value="' + b.id + '">' + String(b.name).replace(/</g, '&lt;') + '</option>').join('');
    if (!navigator.geolocation) { $('loc').textContent = 'We could not find your location. Please choose the building below.'; return; }
    navigator.geolocation.getCurrentPosition((p) => {
      pos = { lat: p.coords.latitude, lng: p.coords.longitude };
      let best = null;
      buildings.forEach((b) => { const m = dist(pos, b); if (!best || m < best.m) best = { b, m }; });
      if (best && best.m <= 120) { $('bld').value = best.b.id; $('loc').textContent = 'You are near ' + best.b.name + '.'; }
      else $('loc').textContent = 'We found where you are on the campus.';
    }, () => { $('loc').textContent = 'We could not find your location. Please choose the building below.'; },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
  }

  $('send').onclick = async () => {
    const err = $('err'); err.hidden = true;
    if (!navigator.onLine) { err.textContent = 'There is no internet connection right now. Please try again when you have signal.'; err.hidden = false; return; }
    const btn = $('send'); btn.disabled = true; btn.textContent = 'Sending…';
    try {
      const res = await fetch(API + 'hazards.php', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, building_id: $('bld').value || null, lat: pos && pos.lat, lng: pos && pos.lng, note: $('note').value, image: photo, urgent: $('urgent').checked })
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.error || 'Could not send the report.');
      if (d.downgraded) $('s4').querySelector('.rp-sub').textContent = 'Thank you. Staff will check it first. A report is shown to everyone straight away only when it has a photo, your location, and you are at the place.';
      else if (d.urgent) $('s4').querySelector('.rp-sub').textContent = 'Your report is showing to everyone now, marked as not yet checked. The school staff will confirm it.';
      show('s4');
    } catch (e) {
      err.textContent = e.message || 'Could not send the report.'; err.hidden = false;
    } finally {
      btn.disabled = false; btn.textContent = 'Send report';
    }
  };

  $('back').onclick = () => {
    if (!$('s3').hidden) { show('s2'); openCamera(); }
    else if (!$('s2').hidden) { stopCamera(); show('s1'); }
    else if (history.length > 1) history.back(); else location.href = 'where.php';
  };
  window.addEventListener('pagehide', stopCamera);
})();
