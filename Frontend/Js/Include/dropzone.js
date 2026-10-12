// Drag-and-drop for existing file inputs. Put data-dropzone="<css selector of the <input type=file>>" on any
// element; dropping a file on it fills that input and fires its normal "change" event, so each page's own
// upload code runs unchanged. Delegated on the document, so it also works on parts Vue draws later.
(function () {
  var over = null;
  function zoneOf(e) { return e.target.closest && e.target.closest('[data-dropzone]'); }
  function hasFiles(e) { return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') !== -1; }

  document.addEventListener('dragover', function (e) {
    var z = zoneOf(e);
    if (!z || !hasFiles(e)) return;
    e.preventDefault();
    if (over !== z) { if (over) over.classList.remove('is-over'); over = z; z.classList.add('is-over'); }
  });
  document.addEventListener('dragleave', function (e) {
    var z = zoneOf(e);
    if (z && over === z && !z.contains(e.relatedTarget)) { z.classList.remove('is-over'); over = null; }
  });
  document.addEventListener('drop', function (e) {
    var z = zoneOf(e);
    if (over) { over.classList.remove('is-over'); over = null; }
    if (!z || !hasFiles(e)) return;
    e.preventDefault();
    var input = document.querySelector(z.getAttribute('data-dropzone'));
    if (!input || input.disabled || !e.dataTransfer.files.length) return;
    var dt = new DataTransfer();
    dt.items.add(e.dataTransfer.files[0]);          // these inputs take one file
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
})();
