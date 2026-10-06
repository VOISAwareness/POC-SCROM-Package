// Finds the LMS-provided SCORM 1.2 API by walking up the window hierarchy.
function findAPI(win) {
  for (let i = 0; win && i < 10; i++) {
    if (win.API) return win.API;
    if (win === win.parent) break;
    win = win.parent;
  }
  return null;
}

const api = findAPI(window);
const log = (msg) => { document.getElementById('log').textContent += msg + '\n'; };

window.addEventListener('load', () => {
  if (!api) { log('SCORM API not found'); return; }
  api.LMSInitialize('');
  log('Learner: ' + api.LMSGetValue('cmi.core.student_name'));
  log('Status: ' + api.LMSGetValue('cmi.core.lesson_status'));
  document.getElementById('complete').onclick = () => {
    api.LMSSetValue('cmi.core.score.raw', '100');
    api.LMSSetValue('cmi.core.lesson_status', 'passed');
    api.LMSCommit('');
    log('Marked as passed with score 100');
  };
});
window.addEventListener('unload', () => api && api.LMSFinish(''));
