// Security checks run on every uploaded package before anything is written to disk.
const path = require('path');

const MAX_ENTRIES = 20000;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB uncompressed
const MAX_RATIO = 200; // uncompressed / compressed, for entries over 1 MB
const RATIO_MIN_BYTES = 1024 * 1024;

// Executables and server-side or OS scripts have no place in a SCORM course.
const BLOCKED_EXTENSIONS = new Set([
  'exe', 'dll', 'com', 'scr', 'msi', 'msp', 'bat', 'cmd', 'ps1', 'psm1', 'psd1', 'vbs', 'vbe',
  'jse', 'wsf', 'wsh', 'hta', 'cpl', 'lnk', 'reg', 'inf', 'sys', 'drv', 'ocx', 'jar', 'class',
  'apk', 'app', 'dmg', 'pkg', 'deb', 'rpm', 'sh', 'bash', 'zsh', 'csh', 'ksh',
  'php', 'phtml', 'asp', 'aspx', 'jsp', 'cgi', 'pl', 'py', 'rb', 'htaccess',
]);

function extensionOf(name) {
  const base = path.posix.basename(name.replace(/\\/g, '/')).toLowerCase();
  return base.startsWith('.') ? base.slice(1) : path.posix.extname(base).slice(1);
}

function isUnsafePath(name) {
  const normalized = name.replace(/\\/g, '/');
  if (normalized.startsWith('/') || /^[a-z]:/i.test(normalized)) return true;
  return normalized.split('/').includes('..');
}

function isSymlink(entry) {
  const mode = (entry.header.attr >>> 16) & 0o170000;
  return mode === 0o120000;
}

function check(id, label, offenders, detail) {
  return offenders.length
    ? { id, label, status: 'fail', detail: `${detail}: ${offenders.slice(0, 3).join(', ')}${offenders.length > 3 ? ` (+${offenders.length - 3} more)` : ''}` }
    : { id, label, status: 'pass' };
}

// `entries` are adm-zip entries of an archive that already opened successfully.
function scanPackage(entries) {
  const files = entries.filter((e) => !e.isDirectory);
  const names = entries.map((e) => e.entryName);

  const totalBytes = files.reduce((sum, e) => sum + e.header.size, 0);
  const suspicious = files.filter((e) => e.header.size > RATIO_MIN_BYTES
    && e.header.size / Math.max(e.header.compressedSize, 1) > MAX_RATIO);
  const sizeProblems = [];
  if (entries.length > MAX_ENTRIES) sizeProblems.push(`${entries.length} entries (limit ${MAX_ENTRIES})`);
  if (totalBytes > MAX_TOTAL_BYTES) sizeProblems.push(`${(totalBytes / 1e9).toFixed(1)} GB uncompressed (limit 2 GB)`);
  suspicious.forEach((e) => sizeProblems.push(`${e.entryName} compresses ${Math.round(e.header.size / Math.max(e.header.compressedSize, 1))}:1`));

  const hasManifest = names.some((n) => /(^|\/)imsmanifest\.xml$/i.test(n.replace(/\\/g, '/')) && n.split('/').length <= 3);

  const checks = [
    { id: 'archive', label: 'Valid zip archive', status: 'pass' },
    check('paths', 'Safe file paths (no path traversal)', names.filter(isUnsafePath), 'Unsafe path'),
    check('filetypes', 'No executable or script files', files.map((e) => e.entryName).filter((n) => BLOCKED_EXTENSIONS.has(extensionOf(n))), 'Blocked file'),
    check('symlinks', 'No symbolic links', entries.filter(isSymlink).map((e) => e.entryName), 'Symbolic link'),
    check('size', 'Size and compression limits (zip bomb)', sizeProblems, 'Over limit'),
    hasManifest
      ? { id: 'manifest', label: 'SCORM manifest present', status: 'pass' }
      : { id: 'manifest', label: 'SCORM manifest present', status: 'warn', detail: 'imsmanifest.xml not found; launching the first HTML page instead' },
  ];

  const failed = checks.find((c) => c.status === 'fail');
  return {
    passed: !failed,
    checks,
    summary: failed ? `${failed.label} — ${failed.detail}` : `${checks.filter((c) => c.status === 'pass').length}/${checks.length} checks passed`,
  };
}

module.exports = { scanPackage };
