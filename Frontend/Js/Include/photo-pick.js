// Admin · reads a picked photo for Register Building / Register Room.
// Phone photos are 3–8 MB, and students load them on mobile data (one building panel can list 30+ room thumbnails),
// so a photo is shrunk here, before upload, to at most MAX px on its long side, as JPEG. Drawing it onto a canvas also
// drops the camera's embedded metadata (location, device). The server still checks the bytes it receives.
// LamparaPhoto.read(file) -> Promise<"data:image/jpeg;base64,...">
(function () {
  const MAX = 1600, QUALITY = 0.85;

  function load(file) {
    if (typeof createImageBitmap === 'function') {
      return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => loadImg(file));
    }
    return loadImg(file);
  }
  function loadImg(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That photo could not be opened. Try a JPEG or PNG.')); };
      img.src = url;
    });
  }

  async function read(file) {
    if (!file || !/^image\//.test(file.type)) throw new Error('Choose a photo (JPEG, PNG or WebP).');
    const img = await load(file);
    const k = Math.min(1, MAX / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * k));
    c.height = Math.max(1, Math.round(img.height * k));
    const g = c.getContext('2d');
    g.fillStyle = '#fff';                 // JPEG has no transparency: a see-through PNG would otherwise turn black
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    if (img.close) img.close();
    return c.toDataURL('image/jpeg', QUALITY);
  }

  window.LamparaPhoto = { read };
})();
