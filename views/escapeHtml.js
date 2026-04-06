// Tiny zero-dep HTML escape utility shared by every view and route file.
// Previously duplicated in 14+ files.
//
// Uses `s == null ? '' : s` so 0 and false are correctly stringified
// (vs `s || ''` which would silently drop them).

function escHTML(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = { escHTML };
