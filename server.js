const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');

const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

app.use(express.static(path.join(__dirname, 'public')));
app.use('/packages', express.static(UPLOAD_DIR));

// Extract every entry of the zip under `dest`, refusing entries that would escape it.
function extractZip(buffer, dest) {
  const entries = new AdmZip(buffer).getEntries();
  for (const entry of entries) {
    const target = path.resolve(dest, entry.entryName);
    if (target !== dest && !target.startsWith(dest + path.sep)) {
      throw new Error(`Unsafe path in zip: ${entry.entryName}`);
    }
    if (entry.isDirectory) {
      fs.mkdirSync(target, { recursive: true });
    } else {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, entry.getData());
    }
  }
  return entries.filter((e) => !e.isDirectory).length;
}

// Locate imsmanifest.xml; some authoring tools wrap the package in a top-level folder.
function findManifest(dir, depth = 0) {
  const direct = path.join(dir, 'imsmanifest.xml');
  if (fs.existsSync(direct)) return direct;
  if (depth >= 2) return null;
  for (const name of fs.readdirSync(dir)) {
    const sub = path.join(dir, name);
    if (fs.statSync(sub).isDirectory() && name !== '__MACOSX') {
      const found = findManifest(sub, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function attrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
    out[m[1].toLowerCase()] = m[3] !== undefined ? m[3] : m[4];
  }
  return out;
}

function decodeXml(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
    .trim();
}

// Read the course title, SCORM version and launch file from imsmanifest.xml.
function parseManifest(xml) {
  const result = { title: null, version: null, launch: null };

  const schemaVersion = xml.match(/<schemaversion>\s*([^<]+?)\s*<\/schemaversion>/i);
  if (schemaVersion) result.version = schemaVersion[1];
  else if (/adlcp_rootv1p2/i.test(xml)) result.version = '1.2';

  const org = xml.match(/<organization\b[\s\S]*?<\/organization>/i);
  const titleSource = org ? org[0] : xml;
  const title = titleSource.match(/<title>([\s\S]*?)<\/title>/i);
  if (title) result.title = decodeXml(title[1]);

  const resources = [...xml.matchAll(/<resource\b[^>]*>/gi)].map((m) => attrs(m[0]));
  const firstItem = org && org[0].match(/<item\b[^>]*identifierref\s*=\s*["']([^"']+)["']/i);
  let resource = firstItem && resources.find((r) => r.identifier === firstItem[1] && r.href);
  if (!resource) {
    resource = resources.find((r) => r.href && /sco/i.test(r['adlcp:scormtype'] || r['adlcp:scormType'] || ''))
      || resources.find((r) => r.href);
  }
  if (resource) {
    result.launch = (resource['xml:base'] || '') + resource.href;
  }
  return result;
}

// Pages to prefer over the manifest's launch file, e.g. the self-contained `index_local.html`
// that some authoring tools export next to the SCORM launcher `index.html`.
const PREFERRED_PAGES = ['index_local.html', 'index_lms.html'];

function fallbackLaunch(root) {
  for (const name of [...PREFERRED_PAGES, 'index.html', 'story.html', 'launch.html']) {
    if (fs.existsSync(path.join(root, name))) return name;
  }
  const html = fs.readdirSync(root).find((f) => /\.html?$/i.test(f));
  return html || null;
}

app.post('/api/packages', upload.single('package'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  if (!/\.zip$/i.test(req.file.originalname)) {
    return res.status(400).json({ error: 'Please upload a .zip SCORM package.' });
  }

  const id = crypto.randomUUID();
  const dest = path.join(UPLOAD_DIR, id);
  fs.mkdirSync(dest, { recursive: true });

  try {
    const fileCount = extractZip(req.file.buffer, dest);

    const manifestPath = findManifest(dest);
    const root = manifestPath ? path.dirname(manifestPath) : dest;
    let info = { title: null, version: null, launch: null };
    if (manifestPath) info = parseManifest(fs.readFileSync(manifestPath, 'utf8'));

    let manifestLaunch = info.launch;
    const manifestFile = manifestLaunch && path.join(root, manifestLaunch.split(/[?#]/)[0]);
    if (manifestLaunch && !fs.existsSync(manifestFile)) manifestLaunch = null;

    const preferred = PREFERRED_PAGES.find((name) => fs.existsSync(path.join(root, name)));
    const launch = preferred || manifestLaunch || fallbackLaunch(root);
    if (!launch) throw new Error('Could not find a launch page (index_local.html / index.html) in the package.');

    const rootRel = path.relative(UPLOAD_DIR, root).split(path.sep).map(encodeURIComponent).join('/');
    const toUrl = (page) =>
      `/packages/${rootRel}/` + page.split('/').map((p) => (/[?#]/.test(p) ? p : encodeURIComponent(p))).join('/');

    // Every HTML page in the package root, so the user can switch e.g. index_local.html <-> index.html.
    const pages = fs.readdirSync(root).filter((f) => /\.html?$/i.test(f));
    if (manifestLaunch && !pages.includes(manifestLaunch)) pages.push(manifestLaunch);

    res.json({
      id,
      title: info.title || req.file.originalname.replace(/\.zip$/i, ''),
      scormVersion: info.version,
      hasManifest: Boolean(manifestPath),
      launch,
      launchUrl: toUrl(launch),
      manifestLaunch,
      pages: pages.map((name) => ({ name, url: toUrl(name) })),
      files: fileCount,
    });
  } catch (err) {
    fs.rmSync(dest, { recursive: true, force: true });
    res.status(422).json({ error: err.message || 'Failed to process the package.' });
  }
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(413).json({ error: err.message });
  }
  next(err);
});

app.listen(PORT, () => {
  console.log(`SCORM LMS POC running at http://localhost:${PORT}`);
});
