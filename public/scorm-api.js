// Minimal SCORM run-time API (1.2 `window.API` and 2004 `window.API_1484_11`).
// The course inside the iframe walks up `window.parent` looking for these objects.
// Data is kept in memory and mirrored to localStorage per package so progress survives a reload.
(function () {
  const listeners = [];
  let storageKey = null;
  let data = {};
  let lastError = '0';

  function load(key) {
    storageKey = key;
    try { data = JSON.parse(localStorage.getItem(key)) || {}; } catch (e) { data = {}; }
  }

  function persist() {
    if (!storageKey) return;
    try { localStorage.setItem(storageKey, JSON.stringify(data)); } catch (e) { /* storage unavailable */ }
  }

  function notify() { listeners.forEach((fn) => fn({ ...data })); }

  function log(...args) { console.debug('[SCORM]', ...args); }

  const defaults12 = {
    'cmi.core.student_id': 'learner-001',
    'cmi.core.student_name': 'Learner, Demo',
    'cmi.core.lesson_status': 'not attempted',
    'cmi.core.entry': 'ab-initio',
    'cmi.core.credit': 'credit',
    'cmi.core.lesson_mode': 'normal',
    'cmi.core.lesson_location': '',
    'cmi.core.score.raw': '',
    'cmi.suspend_data': '',
    'cmi.launch_data': '',
    'cmi._version': '3.4',
  };
  const defaults2004 = {
    'cmi.learner_id': 'learner-001',
    'cmi.learner_name': 'Learner, Demo',
    'cmi.completion_status': 'unknown',
    'cmi.success_status': 'unknown',
    'cmi.entry': 'ab-initio',
    'cmi.mode': 'normal',
    'cmi.location': '',
    'cmi.suspend_data': '',
    'cmi.launch_data': '',
    'cmi._version': '1.0',
  };

  function getValue(key, defaults) {
    lastError = '0';
    if (key in data) return String(data[key]);
    if (key in defaults) return defaults[key];
    if (/\._count$/.test(key)) return '0';
    return '';
  }

  function setValue(key, value) {
    lastError = '0';
    data[key] = String(value);
    log('Set', key, '=', value);
    notify();
    return 'true';
  }

  function commit() {
    lastError = '0';
    persist();
    log('Commit');
    return 'true';
  }

  function finish(exitKey) {
    // Next launch resumes if the course asked to suspend.
    if (data[exitKey] === 'suspend') data['_resume'] = 'true';
    persist();
    log('Finish');
    return 'true';
  }

  function initialize() {
    lastError = '0';
    if (data['_resume'] === 'true') {
      data['cmi.core.entry'] = 'resume';
      data['cmi.entry'] = 'resume';
    }
    if (!data['cmi.core.lesson_status']) data['cmi.core.lesson_status'] = 'incomplete';
    log('Initialize');
    notify();
    return 'true';
  }

  const errorStrings = { '0': 'No error', '101': 'General exception', '301': 'Not initialized' };

  window.API = {
    LMSInitialize: () => initialize(),
    LMSFinish: () => finish('cmi.core.exit'),
    LMSGetValue: (k) => getValue(k, defaults12),
    LMSSetValue: (k, v) => setValue(k, v),
    LMSCommit: () => commit(),
    LMSGetLastError: () => lastError,
    LMSGetErrorString: (c) => errorStrings[c] || 'Unknown error',
    LMSGetDiagnostic: (c) => errorStrings[c] || '',
  };

  window.API_1484_11 = {
    Initialize: () => initialize(),
    Terminate: () => finish('cmi.exit'),
    GetValue: (k) => getValue(k, defaults2004),
    SetValue: (k, v) => setValue(k, v),
    Commit: () => commit(),
    GetLastError: () => lastError,
    GetErrorString: (c) => errorStrings[c] || 'Unknown error',
    GetDiagnostic: (c) => errorStrings[c] || '',
  };

  window.ScormRuntime = {
    start(packageKey) { load('scorm:' + packageKey); notify(); },
    stop() { persist(); storageKey = null; data = {}; },
    onChange(fn) { listeners.push(fn); },
  };
})();
