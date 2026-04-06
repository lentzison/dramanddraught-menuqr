// Reusable image upload widget for the admin.
//
// Renders a file picker (base64 inline) + URL input + live preview + remove button.
// Used by event banner, event sections, menu items, and daily specials.
//
// Usage:
//   imageUploadWidget({
//     name: 'image',         // form field name (the value is sent here)
//     prefix: 'menu-item-X', // unique DOM id prefix to namespace inputs
//     value: existingUrl,    // current image URL or data URL (optional)
//   })
//
// Then include `imageUploadWidgetCss()` once in the page <style> block,
// and `imageUploadWidgetScript()` once in the page <script> block.

const { escHTML } = require('./escapeHtml');

function imageUploadWidget(opts = {}) {
  const name = opts.name || 'image';
  const prefix = opts.prefix || ('img-' + Math.random().toString(36).slice(2, 8));
  const value = opts.value || '';
  const hasValue = !!value;
  const isUrl = hasValue && /^https?:\/\//i.test(value);
  return `
    <div class="iuw-wrap" data-prefix="${escHTML(prefix)}">
      <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" id="${escHTML(prefix)}-file" class="iuw-file" />
      <div class="iuw-hint">Click to choose a file (max ~500&#8239;KB), or paste a hosted image URL below.</div>
      <input type="text" id="${escHTML(prefix)}-url-input" placeholder="https://... (optional alternative)" class="iuw-url-input" value="${isUrl ? escHTML(value) : ''}" />
      <input type="hidden" id="${escHTML(prefix)}-src" name="${escHTML(name)}" value="${hasValue ? escHTML(value) : ''}" />
      <div class="iuw-preview-wrap">
        <img id="${escHTML(prefix)}-preview" class="iuw-preview" src="${hasValue ? escHTML(value) : ''}" alt="" style="${hasValue ? '' : 'display:none'}" />
        ${hasValue ? `<button type="button" class="btn btn-secondary btn-sm iuw-clear" data-prefix="${escHTML(prefix)}">Remove image</button>` : ''}
      </div>
    </div>
  `;
}

function imageUploadWidgetCss() {
  return `
    .iuw-wrap {
      background: #0d0d0d;
      border: 1px solid #222;
      border-radius: 8px;
      padding: 14px;
      margin-bottom: 8px;
    }
    .iuw-hint { color: #888; font-size: 0.78rem; margin: 6px 0 8px; }
    .iuw-url-input { margin-bottom: 10px !important; }
    .iuw-preview-wrap { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .iuw-preview { max-width: 240px; max-height: 160px; border-radius: 6px; border: 1px solid #333; }
  `;
}

function imageUploadWidgetScript() {
  // All event handlers use delegation so a single registration handles
  // every widget on the page (including ones added dynamically).
  return `
    (function() {
      if (window.__iuwInit) return;
      window.__iuwInit = true;

      document.addEventListener('change', function(e) {
        if (!e.target.classList || !e.target.classList.contains('iuw-file')) return;
        var input = e.target;
        var prefix = input.id.replace(/-file$/, '');
        var srcInput = document.getElementById(prefix + '-src');
        var preview = document.getElementById(prefix + '-preview');
        var urlInput = document.getElementById(prefix + '-url-input');
        var file = input.files && input.files[0];
        if (!file) return;
        if (file.size > 750 * 1024) {
          alert('Image is too large. Max ~500 KB. Try compressing the image, or paste a hosted URL instead.');
          input.value = '';
          return;
        }
        var reader = new FileReader();
        reader.onload = function() {
          if (srcInput) srcInput.value = reader.result;
          if (preview) { preview.src = reader.result; preview.style.display = ''; }
          if (urlInput) urlInput.value = '';
        };
        reader.readAsDataURL(file);
      });

      document.addEventListener('input', function(e) {
        if (!e.target.classList || !e.target.classList.contains('iuw-url-input')) return;
        var input = e.target;
        var prefix = input.id.replace(/-url-input$/, '');
        var srcInput = document.getElementById(prefix + '-src');
        var preview = document.getElementById(prefix + '-preview');
        var url = (input.value || '').trim();
        if (srcInput) srcInput.value = url;
        if (preview) {
          if (/^https?:\\/\\//i.test(url)) { preview.src = url; preview.style.display = ''; }
          else { preview.style.display = 'none'; }
        }
      });

      document.addEventListener('click', function(e) {
        if (!e.target.classList || !e.target.classList.contains('iuw-clear')) return;
        var prefix = e.target.getAttribute('data-prefix');
        var srcInput = document.getElementById(prefix + '-src');
        var preview = document.getElementById(prefix + '-preview');
        var urlInput = document.getElementById(prefix + '-url-input');
        var fileInput = document.getElementById(prefix + '-file');
        if (srcInput) srcInput.value = '';
        if (preview) { preview.src = ''; preview.style.display = 'none'; }
        if (urlInput) urlInput.value = '';
        if (fileInput) fileInput.value = '';
      });
    })();
  `;
}

// Sanitize an image src on the server side: allow https/http URLs and small data URLs.
function sanitizeImageSrc(src) {
  if (!src) return null;
  const str = String(src).trim();
  if (!str) return null;
  if (/^data:image\/(jpeg|jpg|png|gif|webp);base64,/i.test(str)) {
    if (str.length > 750 * 1024) return null;
    return str;
  }
  if (/^https?:\/\//i.test(str)) {
    return str.slice(0, 2000);
  }
  return null;
}

module.exports = {
  imageUploadWidget,
  imageUploadWidgetCss,
  imageUploadWidgetScript,
  sanitizeImageSrc,
};
