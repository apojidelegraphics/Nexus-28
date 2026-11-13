// Attachments: files, images and screen captures added to a message.
// Stored in <userData>/attachments as <id>.<ext> + <id>.json (name, kind, mime, text, …).
// Messages keep only { id, name, kind, mime, thumb }; the model gets the text (always) and the image
// (only for the newest message, so long chats stay cheap).
const fs = require('fs');
const path = require('path');

const MAX_BYTES = 25 * 1024 * 1024;
const TEXT_LIMIT = 60000;        // chars of extracted text kept per attachment
const OLD_TEXT_LIMIT = 1500;     // chars sent for attachments on older messages
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|heic|heif|tiff?|bmp)$/i;
const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|jsonl|xml|ya?ml|toml|ini|log|html?|css|js|mjs|cjs|ts|tsx|jsx|py|rb|go|rs|java|kt|swift|c|cc|cpp|h|hpp|cs|php|sh|zsh|bash|sql|r|lua|pl|tex|srt|vtt|env\.example|gitignore)$/i;

const newId = () => 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clip = (s, n) => (s.length > n ? s.slice(0, n) + '\n…[truncated]' : s);

class Attachments {
  // deps: { dir, nativeImage, helper } — helper (NexusCore) does OCR and PDF text on this Mac.
  constructor({ dir, nativeImage, helper }) {
    this.dir = path.join(dir, 'attachments');
    this.nativeImage = nativeImage;
    this.helper = helper;
  }
  file(id, ext) { return path.join(this.dir, id + ext); }
  meta(id) {
    if (!/^a[a-z0-9]+$/.test(id)) return null;
    try { return JSON.parse(fs.readFileSync(this.file(id, '.json'), 'utf8')); } catch { return null; }
  }
  public(m) { return m && { id: m.id, name: m.name, kind: m.kind, mime: m.mime, thumb: m.thumb || '', chars: (m.text || '').length, app: m.app, title: m.title, note: m.note || '' }; }
  save(m) { fs.mkdirSync(this.dir, { recursive: true }); fs.writeFileSync(this.file(m.id, '.json'), JSON.stringify(m)); return m; }

  async helperText(cmd, file) {
    if (!this.helper?.available()) return { text: '', note: 'Text reading needs the NexusCore helper (npm run build:helper).' };
    try {
      const ev = await this.helper.request({ cmd, id: cmd + '-' + Math.random().toString(36).slice(2), path: file }, ['result'], 60000);
      return { text: String(ev.data?.text || '').trim(), pages: ev.data?.pages };
    } catch (e) { return { text: '', note: e.message }; }
  }

  // Image bytes → stored PNG/JPEG (max 1600px), thumbnail, on-device OCR text.
  async fromImage(buf, { name = 'image.png', kind = 'image', extra = {} } = {}) {
    let img = this.nativeImage.createFromBuffer(buf);
    if (img.isEmpty()) throw new Error(`Couldn't open ${name} as an image.`);
    const { width, height } = img.getSize();
    const scale = Math.min(1, 1600 / Math.max(width, height));
    if (scale < 1) img = img.resize({ width: Math.round(width * scale), height: Math.round(height * scale), quality: 'best' });
    const png = /\.png$/i.test(name) || kind === 'screen';
    const data = png ? img.toPNG() : img.toJPEG(85);
    const id = newId(), ext = png ? '.png' : '.jpg';
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(this.file(id, ext), data);
    const t = img.resize({ width: Math.min(240, img.getSize().width) });
    const ocr = await this.helperText('ocr', this.file(id, ext));
    return this.save({ id, name, kind, mime: png ? 'image/png' : 'image/jpeg', ext, thumb: t.toDataURL(), text: clip(ocr.text, TEXT_LIMIT), created: Date.now(), ...extra });
  }

  async fromPath(p) {
    const st = fs.statSync(p);
    if (!st.isFile()) throw new Error(`${path.basename(p)} isn't a file.`);
    if (st.size > MAX_BYTES) throw new Error(`${path.basename(p)} is over 25 MB.`);
    const name = path.basename(p);
    if (IMAGE_EXT.test(name)) {
      let img = this.nativeImage.createFromPath(p);
      if (img.isEmpty()) throw new Error(`Couldn't open ${name}.`);
      return this.fromImage(img.toPNG(), { name: name.replace(/\.\w+$/, '.png') });
    }
    if (/\.pdf$/i.test(name)) {
      const id = newId();
      fs.mkdirSync(this.dir, { recursive: true });
      fs.copyFileSync(p, this.file(id, '.pdf'));
      const r = await this.helperText('pdf_text', this.file(id, '.pdf'));
      if (!r.text && r.note) throw new Error(`Couldn't read ${name}: ${r.note}`);
      return this.save({ id, name, kind: 'pdf', mime: 'application/pdf', ext: '.pdf', text: clip(r.text || '(no text found — it may be a scanned PDF)', TEXT_LIMIT), pages: r.pages, created: Date.now() });
    }
    const buf = fs.readFileSync(p);
    if (!TEXT_EXT.test(name) && buf.subarray(0, 4096).includes(0)) throw new Error(`${name} isn't a text, image or PDF file.`);
    return this.fromText(buf.toString('utf8'), name);
  }
  fromText(text, name = 'note.txt') {
    const id = newId();
    return this.save({ id, name, kind: 'text', mime: 'text/plain', ext: '', text: clip(String(text), TEXT_LIMIT), created: Date.now() });
  }
  async fromData(name, mime, bytes) {
    const buf = Buffer.from(bytes);
    if (buf.length > MAX_BYTES) throw new Error(`${name} is over 25 MB.`);
    if (/^image\//.test(mime)) return this.fromImage(buf, { name: name || 'pasted-image.png' });
    if (/pdf/.test(mime)) { const tmp = path.join(this.dir, newId() + '.pdf'); fs.mkdirSync(this.dir, { recursive: true }); fs.writeFileSync(tmp, buf); try { return await this.fromPath(tmp); } finally { try { fs.unlinkSync(tmp); } catch {} } }
    return this.fromText(buf.toString('utf8'), name || 'pasted.txt');
  }

  // Turn renderer messages ({ role, content, attachments:[{id}] }) into provider messages:
  // attachment text goes into the content; images ride along on the newest user message only.
  expand(messages) {
    let lastUser = -1;
    messages.forEach((m, i) => { if (m.role === 'user') lastUser = i; });
    return messages.map((m, i) => {
      const atts = (m.attachments || []).map(a => this.meta(a.id)).filter(Boolean);
      const { attachments, ...rest } = m;
      if (!atts.length) return rest;
      const newest = i === lastUser;
      const blocks = atts.map(a => {
        const label = a.kind === 'screen' ? `Screenshot of ${a.app || 'the screen'}${a.title ? ` — "${a.title}"` : ''}` : a.kind === 'image' ? `Image "${a.name}"` : `File "${a.name}"`;
        const text = a.text ? clip(a.text, newest ? TEXT_LIMIT : OLD_TEXT_LIMIT) : '';
        const how = a.kind === 'screen' || a.kind === 'image' ? 'Text read from it' : 'Contents';
        return `[${label}${newest && (a.kind === 'screen' || a.kind === 'image') ? ' is attached' : ''}]${text ? `\n${how}:\n${text}` : ''}`;
      });
      const images = newest ? atts.filter(a => a.kind === 'image' || a.kind === 'screen').map(a => {
        try { return { mime: a.mime, data: fs.readFileSync(this.file(a.id, a.ext)).toString('base64') }; } catch { return null; }
      }).filter(Boolean) : [];
      return { ...rest, content: `${blocks.join('\n\n')}\n\n${rest.content || ''}`.trim(), ...(images.length ? { images } : {}) };
    });
  }
}

module.exports = { Attachments, IMAGE_EXT, TEXT_EXT };
