// Best-effort resume text extraction — dependency-free.
//
// Resumes are stored as base64 data URLs on the application. The screener can
// use their text as adjacent-experience evidence, but we don't want a heavy
// parsing dependency for it, so this module does pragmatic extraction:
//   - text/plain        → decoded directly
//   - PDF               → inflate FlateDecode content streams (node:zlib) and
//                         scrape Tj/TJ text-showing operators
//   - DOCX              → walk the zip local file headers to word/document.xml,
//                         inflateRaw, strip XML tags
//   - images / unknown  → null
//
// All of this is heuristic: PDFs with custom font encodings or scanned images
// produce garbage or nothing, which the printable-ratio guard filters out.
// Callers treat null as "resume on file, text unavailable" — never an error.

const zlib = require('zlib');

const MAX_TEXT_CHARS = 6000;
// Hard bounds so a hostile or malformed resume can never burn unbounded CPU on
// the single-threaded event loop (a stuck extraction once froze the whole site):
const MAX_PDF_CONTENT_CHARS = 1_500_000; // per decompressed stream fed to the regexes
const MAX_STREAMS = 400;                 // PDF content streams scanned per file
const MAX_RESUME_BYTES = 20 * 1024 * 1024;

function printableRatio(s) {
  if (!s || !s.length) return 0;
  let printable = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if ((c >= 32 && c < 127) || c === 9 || c === 10 || c === 13) printable++;
  }
  return printable / s.length;
}

function cleanWhitespace(s) {
  return String(s || '').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}

// Decode a PDF literal string's escape sequences: \( \) \\ \n \r \t and
// octal \ddd.
function decodePdfString(s) {
  return s.replace(/\\(\d{1,3}|.)/g, (m, esc) => {
    if (/^\d/.test(esc)) return String.fromCharCode(parseInt(esc, 8) & 0xff);
    if (esc === 'n') return '\n';
    if (esc === 'r') return '\r';
    if (esc === 't') return '\t';
    return esc; // \( \) \\ and anything else → the literal char
  });
}

// Pull text-showing operator arguments out of a decompressed PDF content
// stream: "(...)Tj", "(...)'" and "[(..) -120 (..)]TJ".
function scrapePdfOperators(content) {
  // Bound the regex input: catastrophic backtracking only bites on large inputs,
  // and a resume never needs more than a fraction of this much text.
  if (content.length > MAX_PDF_CONTENT_CHARS) content = content.slice(0, MAX_PDF_CONTENT_CHARS);
  const parts = [];
  let total = 0;
  // TJ arrays — strings interleaved with kerning numbers. The bare-character
  // class excludes "(" and ")" so every character belongs to exactly ONE branch
  // of the alternation. Previously it was `[^\]\\]`, which also matched "(",
  // letting both the "(...)" branch and the bare branch start on "(" — an
  // ambiguity that backtracks exponentially (ReDoS) on a malformed stream and
  // pinned a CPU core, freezing the whole site.
  const tjArrayRe = /\[((?:\((?:\\.|[^\\()])*\)|[^\]\\()]|\\.)*)\]\s*TJ/g;
  // Single-string shows.
  const tjRe = /\(((?:\\.|[^\\()])*)\)\s*(?:Tj|')/g;
  let m;
  while ((m = tjArrayRe.exec(content)) !== null) {
    const inner = m[1];
    const strRe = /\(((?:\\.|[^\\()])*)\)/g;
    let sm;
    const segs = [];
    while ((sm = strRe.exec(inner)) !== null) segs.push(decodePdfString(sm[1]));
    if (segs.length) { const s = segs.join(''); parts.push(s); total += s.length; }
    if (total > MAX_TEXT_CHARS * 2) return parts; // already have plenty
  }
  while ((m = tjRe.exec(content)) !== null) {
    const s = decodePdfString(m[1]);
    parts.push(s);
    total += s.length;
    if (total > MAX_TEXT_CHARS * 2) return parts;
  }
  return parts;
}

function extractPdfText(buf) {
  const raw = buf.toString('latin1');
  const parts = [];
  let idx = 0;
  let streams = 0;
  let acc = 0;
  while (streams < MAX_STREAMS) {
    const start = raw.indexOf('stream', idx);
    if (start === -1) break;
    streams++;
    // Stream data begins after "stream" + EOL.
    let dataStart = start + 'stream'.length;
    if (raw[dataStart] === '\r') dataStart++;
    if (raw[dataStart] === '\n') dataStart++;
    const end = raw.indexOf('endstream', dataStart);
    if (end === -1) break;
    idx = end + 'endstream'.length;

    const chunk = buf.subarray(dataStart, end);
    let content = null;
    try {
      content = zlib.inflateSync(chunk).toString('latin1');
    } catch (_) {
      // Not FlateDecode (or not compressed) — try the raw bytes; the operator
      // regexes will simply find nothing in binary garbage.
      content = chunk.toString('latin1');
    }
    if (!content || !/(Tj|TJ)/.test(content)) continue;
    const scraped = scrapePdfOperators(content).join(' ');
    if (scraped && printableRatio(scraped) > 0.7) { parts.push(scraped); acc += scraped.length; }
    if (acc >= MAX_TEXT_CHARS) break; // enough text — stop scanning further streams
  }
  const text = cleanWhitespace(parts.join('\n'));
  return text.length >= 40 ? text : null;
}

// Minimal zip walk: iterate local file headers looking for
// word/document.xml, then inflateRaw (method 8) or copy (method 0).
function extractDocxText(buf) {
  let off = 0;
  while (off + 30 <= buf.length) {
    if (buf.readUInt32LE(off) !== 0x04034b50) break; // not a local file header
    const flags = buf.readUInt16LE(off + 6);
    const method = buf.readUInt16LE(off + 8);
    const compSize = buf.readUInt32LE(off + 18);
    const nameLen = buf.readUInt16LE(off + 26);
    const extraLen = buf.readUInt16LE(off + 28);
    const name = buf.toString('utf8', off + 30, off + 30 + nameLen);
    const dataStart = off + 30 + nameLen + extraLen;
    // Streamed entries (bit 3) don't record sizes in the header — bail; Word
    // itself doesn't produce them.
    if (flags & 0x8) return null;
    if (name === 'word/document.xml') {
      const data = buf.subarray(dataStart, dataStart + compSize);
      let xml;
      try {
        xml = method === 8 ? zlib.inflateRawSync(data).toString('utf8') : data.toString('utf8');
      } catch (_) {
        return null;
      }
      // Word separates runs/paragraphs with tags; turn paragraph ends into
      // newlines before stripping the rest.
      const text = cleanWhitespace(
        xml
          .replace(/<w:p[ >]/g, '\n<w:p ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"').replace(/&#?\w+;/g, ' ')
      );
      return text.length >= 40 ? text : null;
    }
    off = dataStart + compSize;
  }
  return null;
}

// Main entry. Returns extracted text (capped) or null.
function extractResumeText(application) {
  try {
    if (!application || !application.resumeData) return null;
    const m = /^data:([^;]+);base64,(.+)$/.exec(String(application.resumeData));
    if (!m) return null;
    const mime = m[1].toLowerCase();
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > MAX_RESUME_BYTES) return null; // implausibly large — don't risk the parse
    const fileName = String(application.resumeFileName || '').toLowerCase();

    let text = null;
    if (mime.includes('pdf') || fileName.endsWith('.pdf')) {
      text = extractPdfText(buf);
    } else if (mime.includes('officedocument.wordprocessingml') || fileName.endsWith('.docx')) {
      text = extractDocxText(buf);
    } else if (mime.startsWith('text/')) {
      const t = cleanWhitespace(buf.toString('utf8'));
      text = t.length >= 40 && printableRatio(t) > 0.7 ? t : null;
    }
    // Legacy .doc and images: no extraction.
    if (!text) return null;
    return text.slice(0, MAX_TEXT_CHARS);
  } catch (err) {
    return null;
  }
}

module.exports = { extractResumeText, extractPdfText, extractDocxText, scrapePdfOperators };
