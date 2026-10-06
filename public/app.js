(function () {
  const $ = (id) => document.getElementById(id);
  const dropZone = $('dropZone');
  const fileInput = $('fileInput');
  const progress = $('progress');
  const progressText = $('progressText');
  const errorEl = $('error');
  const uploadView = $('uploadView');
  const playerView = $('playerView');
  const player = $('player');
  const courseBar = $('courseBar');
  const courseTitle = $('courseTitle');
  const courseStatus = $('courseStatus');
  const pagePicker = $('pagePicker');
  const pageSelect = $('pageSelect');
  const bannerTitle = $('bannerTitle');
  const bannerHint = $('bannerHint');
  const steps = document.querySelectorAll('.step');
  const frame = $('frame');
  const fullscreenBtn = $('fullscreenBtn');
  const scanCard = $('scanCard');
  const scanState = $('scanState');
  const scanBadge = $('scanBadge');
  const scanBadgeText = $('scanBadgeText');
  const scanItems = scanCard.querySelectorAll('[data-check]');

  // Shows the server's security scan result on the Security Scan card.
  function showScan(security) {
    scanItems.forEach((li) => {
      const result = security && security.checks.find((c) => c.id === li.dataset.check);
      li.classList.remove('fail', 'warn');
      li.querySelector('.detail')?.remove();
      if (!result || result.status === 'pass') return;
      li.classList.add(result.status);
      if (result.detail) {
        const detail = document.createElement('span');
        detail.className = 'detail';
        detail.textContent = result.detail;
        li.append(detail);
      }
    });
    const blocked = Boolean(security && !security.passed);
    scanCard.classList.toggle('blocked', blocked);
    scanState.textContent = blocked ? 'Upload blocked' : 'Runs on every upload';
  }

  // Highlights the current step; earlier steps are marked done.
  function setStep(current) {
    steps.forEach((el) => {
      const n = Number(el.dataset.step);
      el.classList.toggle('active', n === current);
      el.classList.toggle('done', n < current);
    });
  }

  function setBanner(title, hint) {
    bannerTitle.textContent = title;
    bannerHint.textContent = `-- ${hint}`;
  }

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = !message;
  }

  function setBusy(busy, text) {
    dropZone.classList.toggle('busy', busy);
    progress.hidden = !busy;
    if (text) progressText.textContent = text;
  }

  function uploadPackage(file) {
    showError('');
    showScan(null);
    if (!file) return;
    if (!/\.zip$/i.test(file.name)) {
      showError('Please choose a .zip SCORM package.');
      return;
    }

    const form = new FormData();
    form.append('package', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/packages');
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      const pct = Math.round((e.loaded / e.total) * 100);
      setBusy(true, pct < 100 ? `Uploading… ${pct}%` : 'Running security scan…');
      if (pct === 100) setStep(2);
    };
    xhr.onload = () => {
      setBusy(false);
      let body = {};
      try { body = JSON.parse(xhr.responseText); } catch (e) { /* non-JSON error */ }
      if (xhr.status >= 200 && xhr.status < 300) launch(body);
      else {
        setStep(body.security ? 2 : 1);
        showScan(body.security);
        showError(body.error || `Upload failed (${xhr.status}).`);
      }
    };
    xhr.onerror = () => {
      setBusy(false);
      setStep(1);
      showError('Network error while uploading the package.');
    };
    setBusy(true, 'Uploading…');
    xhr.send(form);
  }

  function launch(pkg) {
    showScan(null);
    const passedCount = pkg.security.checks.filter((c) => c.status === 'pass').length;
    scanBadgeText.textContent = `Security scan passed · ${passedCount}/${pkg.security.checks.length} checks`;
    scanBadge.title = pkg.security.checks
      .map((c) => `${c.status === 'pass' ? '✓' : '!'} ${c.label}${c.detail ? ` (${c.detail})` : ''}`)
      .join('\n');
    window.ScormRuntime.start(pkg.id);
    courseTitle.textContent = pkg.title;
    courseTitle.title = `${pkg.title} · SCORM ${pkg.scormVersion || 'n/a'} · ${pkg.files} files`;
    uploadView.hidden = true;
    playerView.hidden = false;
    courseBar.hidden = false;
    pageSelect.replaceChildren(...pkg.pages.map((page) => {
      const label = page.name === pkg.manifestLaunch ? `${page.name} (manifest)` : page.name;
      const option = new Option(label, page.url);
      option.selected = page.url === pkg.launchUrl;
      return option;
    }));
    pagePicker.hidden = pkg.pages.length < 2;
    player.src = pkg.launchUrl;
    document.body.classList.add('playing');
    setStep(3);
    setBanner('NOW PLAYING', `SCORM ${pkg.scormVersion || 'n/a'} · ${pkg.files} files`);
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (frame.requestFullscreen) frame.requestFullscreen().catch(() => {});
  }

  function closeCourse() {
    if (document.fullscreenElement) document.exitFullscreen();
    document.body.classList.remove('playing');
    // Let the course call LMSFinish from its unload handler before we reset the runtime.
    player.src = 'about:blank';
    setTimeout(() => window.ScormRuntime.stop(), 0);
    playerView.hidden = true;
    courseBar.hidden = true;
    uploadView.hidden = false;
    fileInput.value = '';
    courseStatus.textContent = 'not attempted';
    courseStatus.className = 'pill';
    setStep(1);
    setBanner('SCORM PACKAGE PLAYER', 'Upload a new course package');
  }

  window.ScormRuntime.onChange((data) => {
    const status = data['cmi.core.lesson_status'] || data['cmi.completion_status'] || 'not attempted';
    const score = data['cmi.core.score.raw'] || data['cmi.score.raw'];
    courseStatus.textContent = score ? `${status} · score ${score}` : status;
    courseStatus.className = `pill ${status.replace(/\s+/g, '-')}`;
  });

  fileInput.addEventListener('change', () => uploadPackage(fileInput.files[0]));
  dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });

  ['dragenter', 'dragover'].forEach((type) =>
    dropZone.addEventListener(type, (e) => {
      e.preventDefault();
      dropZone.classList.add('dragging');
    })
  );
  ['dragleave', 'drop'].forEach((type) =>
    dropZone.addEventListener(type, (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragging');
    })
  );
  dropZone.addEventListener('drop', (e) => uploadPackage(e.dataTransfer.files[0]));
  // Dropping a file outside the zone shouldn't navigate the browser away.
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());

  pageSelect.addEventListener('change', () => { player.src = pageSelect.value; });
  $('closeBtn').addEventListener('click', closeCourse);
  fullscreenBtn.addEventListener('click', toggleFullscreen);
  fullscreenBtn.hidden = !document.fullscreenEnabled;
})();
