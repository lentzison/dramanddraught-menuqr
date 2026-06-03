/* TV board module editor. The modules array is the source of truth; on submit
   it's serialized into the hidden #tv-modules-json input for the server. */
(function () {
  'use strict';

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function uid() {
    return 'm_' + Math.random().toString(36).slice(2, 9);
  }

  window.initTvBoardEditor = function initTvBoardEditor() {
    var types = window.__TV_TYPES__ || [];
    var modules = (window.__TV_MODULES__ || []).map(function (m) {
      m = m || {};
      if (!m.id) m.id = uid();
      if (m.type === 'picks' && !Array.isArray(m.items)) m.items = [];
      return m;
    });

    var container = document.getElementById('tv-modules');
    var addSelect = document.getElementById('tv-add-type');
    var addBtn = document.getElementById('tv-add-btn');
    var hidden = document.getElementById('tv-modules-json');
    var form = document.getElementById('tv-board-form');
    if (!container || !addSelect || !addBtn || !hidden || !form) return;

    var typeLabel = {};
    var typeCurated = {};
    types.forEach(function (t) {
      typeLabel[t.type] = t.label;
      typeCurated[t.type] = !!t.curated;
      var opt = document.createElement('option');
      opt.value = t.type;
      opt.textContent = t.label + (t.curated ? ' (custom)' : '');
      addSelect.appendChild(opt);
    });

    function newModule(type) {
      var m = { id: uid(), type: type };
      if (type === 'picks') m.items = [{ name: '', description: '', by: '', price: '' }];
      if (type === 'message') { m.heading = ''; m.body = ''; }
      return m;
    }

    function pickRowHtml(mi, pi, item) {
      return '' +
        '<div class="tvm-pick">' +
        '<input type="text" placeholder="Drink name" data-act="pf" data-mi="' + mi + '" data-pi="' + pi + '" data-pf="name" value="' + esc(item.name) + '" />' +
        '<input type="text" placeholder="Tasting note (optional)" data-act="pf" data-mi="' + mi + '" data-pi="' + pi + '" data-pf="description" value="' + esc(item.description) + '" />' +
        '<input type="text" placeholder="By (optional)" data-act="pf" data-mi="' + mi + '" data-pi="' + pi + '" data-pf="by" value="' + esc(item.by) + '" />' +
        '<input type="text" placeholder="Price" data-act="pf" data-mi="' + mi + '" data-pi="' + pi + '" data-pf="price" value="' + esc(item.price) + '" />' +
        '<button type="button" class="btn btn-danger btn-sm tvm-icon-btn" data-act="rmpick" data-mi="' + mi + '" data-pi="' + pi + '" aria-label="Remove pick">&times;</button>' +
        '</div>';
    }

    function bodyHtml(m, mi) {
      var rows = '' +
        '<div class="tvm-grid">' +
        '<div><label>Title on screen <span style="font-weight:400;color:var(--text-soft)">(optional)</span></label>' +
        '<input type="text" maxlength="60" placeholder="' + esc(typeLabel[m.type] || m.type) + '" data-act="field" data-mi="' + mi + '" data-field="title" value="' + esc(m.title || '') + '" /></div>' +
        '<div><label>Seconds <span style="font-weight:400;color:var(--text-soft)">(optional)</span></label>' +
        '<input type="number" min="4" max="120" placeholder="default" data-act="field" data-mi="' + mi + '" data-field="seconds" value="' + esc(m.seconds || '') + '" /></div>' +
        '</div>';

      if (m.type === 'picks') {
        var items = Array.isArray(m.items) ? m.items : [];
        var picks = items.map(function (it, pi) { return pickRowHtml(mi, pi, it || {}); }).join('');
        rows += '<div style="margin-top:14px"><label>Picks</label>' + picks +
          '<button type="button" class="btn btn-secondary btn-sm" data-act="addpick" data-mi="' + mi + '">+ Add pick</button></div>';
      } else if (m.type === 'message') {
        rows += '<div style="margin-top:14px">' +
          '<label>Headline</label>' +
          '<input type="text" maxlength="80" placeholder="e.g. Trivia Tonight" data-act="field" data-mi="' + mi + '" data-field="heading" value="' + esc(m.heading || '') + '" />' +
          '<label>Message</label>' +
          '<textarea maxlength="300" placeholder="e.g. 7:30 PM — win a $50 bar tab" data-act="field" data-mi="' + mi + '" data-field="body">' + esc(m.body || '') + '</textarea>' +
          '</div>';
      } else {
        rows += '<p class="field-help" style="margin-top:10px">Pulls live data automatically when the board is shown.</p>';
      }
      return rows;
    }

    function render() {
      if (!modules.length) {
        container.innerHTML = '<div class="tvm-empty">No modules yet. Pick a type above and click <strong>Add module</strong>.</div>';
        sync();
        return;
      }
      container.innerHTML = modules.map(function (m, mi) {
        return '' +
          '<div class="tvm" data-mi="' + mi + '">' +
          '<div class="tvm-head">' +
          '<span class="tvm-type">' + esc(typeLabel[m.type] || m.type) + '</span>' +
          (typeCurated[m.type] ? '<span class="tvm-badge">custom</span>' : '<span class="tvm-badge">live</span>') +
          '<span class="tvm-spacer"></span>' +
          '<label class="tvm-pin"><input type="checkbox" data-act="pin" data-mi="' + mi + '"' + (m.pinned ? ' checked' : '') + ' /> Pin to rail</label>' +
          '<button type="button" class="btn btn-secondary btn-sm tvm-icon-btn" data-act="up" data-mi="' + mi + '" aria-label="Move up">&uarr;</button>' +
          '<button type="button" class="btn btn-secondary btn-sm tvm-icon-btn" data-act="down" data-mi="' + mi + '" aria-label="Move down">&darr;</button>' +
          '<button type="button" class="btn btn-danger btn-sm tvm-icon-btn" data-act="remove" data-mi="' + mi + '" aria-label="Remove">Remove</button>' +
          '</div>' +
          '<div class="tvm-body">' + bodyHtml(m, mi) + '</div>' +
          '</div>';
      }).join('');
      sync();
    }

    function sync() {
      hidden.value = JSON.stringify(modules);
    }

    // Text inputs: update array in place, no re-render (keep focus).
    container.addEventListener('input', function (e) {
      var t = e.target;
      var act = t.getAttribute('data-act');
      if (act === 'field') {
        var mi = +t.getAttribute('data-mi');
        var field = t.getAttribute('data-field');
        if (!modules[mi]) return;
        modules[mi][field] = t.value;
        sync();
      } else if (act === 'pf') {
        var mi2 = +t.getAttribute('data-mi');
        var pi = +t.getAttribute('data-pi');
        var pf = t.getAttribute('data-pf');
        if (!modules[mi2] || !modules[mi2].items || !modules[mi2].items[pi]) return;
        modules[mi2].items[pi][pf] = t.value;
        sync();
      }
    });

    // Pin checkbox: only one module may be pinned.
    container.addEventListener('change', function (e) {
      var t = e.target;
      if (t.getAttribute('data-act') !== 'pin') return;
      var mi = +t.getAttribute('data-mi');
      modules.forEach(function (m, i) { m.pinned = (i === mi) ? t.checked : false; });
      render();
    });

    // Buttons.
    container.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-act]');
      if (!btn) return;
      var act = btn.getAttribute('data-act');
      var mi = +btn.getAttribute('data-mi');
      if (act === 'remove') { modules.splice(mi, 1); render(); }
      else if (act === 'up' && mi > 0) { var a = modules[mi]; modules[mi] = modules[mi - 1]; modules[mi - 1] = a; render(); }
      else if (act === 'down' && mi < modules.length - 1) { var b = modules[mi]; modules[mi] = modules[mi + 1]; modules[mi + 1] = b; render(); }
      else if (act === 'addpick') { if (modules[mi]) { modules[mi].items = modules[mi].items || []; modules[mi].items.push({ name: '', description: '', by: '', price: '' }); render(); } }
      else if (act === 'rmpick') { var pi = +btn.getAttribute('data-pi'); if (modules[mi] && modules[mi].items) { modules[mi].items.splice(pi, 1); render(); } }
    });

    addBtn.addEventListener('click', function () {
      modules.push(newModule(addSelect.value || 'specials'));
      render();
    });

    form.addEventListener('submit', sync);

    // Auto-fill slug from name on the New form (only while slug is untouched).
    var nameInput = document.getElementById('b-name');
    var slugInput = document.getElementById('b-slug');
    if (nameInput && slugInput && !slugInput.value) {
      var slugTouched = false;
      slugInput.addEventListener('input', function () { slugTouched = true; });
      nameInput.addEventListener('input', function () {
        if (slugTouched) return;
        slugInput.value = nameInput.value.toLowerCase().trim()
          .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
      });
    }

    render();
  };
})();
