/* AR Lab — QR anchor scan, reusing the same registered anchors and resolution logic as the main app's
   Frontend/Js/Public/guide-ar.js (Backend/api/qr-anchors.php). Scanning one of these codes gives a trusted
   lat/lng (and, if the anchor has a stored scan_heading, a trusted compass bearing), so an engine can snap
   back to ground truth instead of letting GPS/compass drift accumulate for the whole walk.
   Needs jsQR loaded on the page (the same CDN build guide-ar.php uses). */
(function () {
  'use strict';
  const HFOV_DEG = 55;          // typical portrait back-camera horizontal field of view (matches guide-ar.js)
  const base = document.currentScript ? new URL('../../Backend/api/', document.currentScript.src).href : '../../Backend/api/';

  // Reads `video` every 250ms until a registered OUTDOOR anchor QR resolves, then stops and resolves with
  //   { lat, lng, label, headingDeg }   headingDeg is null if the anchor has no stored scan_heading, or
  //                                     heading() was not given (nothing to correct against).
  // opts.heading(): optional, returns the caller's current best-guess compass heading in degrees, called once
  //   at the moment the code is read (used only to report how far off that heading is, not required to find the anchor).
  // Returns a promise with a .cancel() to stop scanning early (e.g. the tester closes the scan UI).
  function scan(video, opts) {
    opts = opts || {};
    let stop = false;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const promise = new Promise((resolve, reject) => {
      (async function loop() {
        while (!stop) {
          if (video && video.readyState >= 2 && video.videoWidth && typeof jsQR !== 'undefined') {
            const scale = Math.min(1, 640 / video.videoWidth);
            canvas.width = Math.round(video.videoWidth * scale);
            canvas.height = Math.round(video.videoHeight * scale);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const result = jsQR(frame.data, frame.width, frame.height);
            if (result && result.data) {
              let code = result.data;
              try { const u = new URL(result.data); code = u.searchParams.get('qr') || result.data; } catch (e) { /* plain code, not a URL */ }
              try {
                const res = await fetch(base + 'qr-anchors.php?code=' + encodeURIComponent(code));
                const data = await res.json();
                if (data && data.success && data.kind === 'outdoor') {
                  let trueHeading = null, errorDeg = null;
                  if (data.scan_heading != null) {
                    const loc = result.location;
                    const cx = (loc.topLeftCorner.x + loc.topRightCorner.x + loc.bottomLeftCorner.x + loc.bottomRightCorner.x) / 4;
                    const f = (canvas.width / 2) / Math.tan(HFOV_DEG * Math.PI / 360);
                    const alpha = Math.max(-25, Math.min(25, Math.atan((cx - canvas.width / 2) / f) * 180 / Math.PI));
                    trueHeading = (data.scan_heading - alpha + 360) % 360;
                    const cam = typeof opts.heading === 'function' ? opts.heading() : null;
                    if (cam != null) errorDeg = ARLab.geo.norm180(cam - trueHeading);  // current heading minus true: add -errorDeg to correct
                  }
                  stop = true;
                  resolve({ lat: data.lat, lng: data.lng, label: data.label, trueHeading, errorDeg });
                  return;
                }
                if (data && (!data.success || data.kind !== 'outdoor')) { /* not the campus anchor: keep scanning */ }
              } catch (e) { /* network hiccup: keep scanning */ }
            }
          }
          await new Promise((r) => setTimeout(r, 250));
        }
      })().catch(reject);
    });
    promise.cancel = () => { stop = true; };
    return promise;
  }

  window.ARLab = Object.assign(window.ARLab || {}, { anchor: { scan } });
})();
