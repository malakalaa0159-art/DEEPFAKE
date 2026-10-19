(() => {
  'use strict';

  /* =========================================================
     AI IMAGE DETECTOR — FRONTEND
     Prediction and confidence come from the backend only.
     Configure API_ENDPOINT and API_FILE_FIELD below.
  ========================================================= */

  const API_ENDPOINT = 'http://127.0.0.1:8000/api/detect/image';
  const API_FILE_FIELD = 'file';
  const REQUEST_TIMEOUT_MS = 90000;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const VIEWS = ['home', 'analysis', 'result', 'account', 'history', 'features', 'about'];
  const USERS_KEY = 'aiImageDetector.demoUsers.v1';
  const SESSION_KEY = 'aiImageDetector.demoSession.v1';
  const GUEST_REPORTS_KEY = 'aiImageDetector.guestReports.v1';
  const MAX_IMAGE_SIZE = 15 * 1024 * 1024;
  const MAX_REPORTS = 20;

  const state = {
    currentView: 'home',
    previousViews: [],
    photo: null,
    report: null,
    runId: 0,
    analyzing: false
  };

  const pause = ms => new Promise(resolve => window.setTimeout(resolve, ms));
  const normalizedEmail = value => String(value || '').trim().toLowerCase();

  const safeParse = (value, fallback) => {
    try {
      return value ? JSON.parse(value) : fallback;
    } catch {
      return fallback;
    }
  };

  const formatBytes = bytes => {
    if (!Number.isFinite(Number(bytes))) return '—';

    const size = Number(bytes);

    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;

    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatDate = value => {
    const date = new Date(value);

    return Number.isNaN(date.getTime())
      ? '—'
      : date.toLocaleString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
  };

  const shortDate = value => {
    const date = new Date(value);

    return Number.isNaN(date.getTime())
      ? '—'
      : date.toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
  };

  const escapeHtml = value =>
    String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[ch]);

  function setText(selector, value) {
    const element = $(selector);
    if (element) element.textContent = value;
  }

  // =========================================================
  // NAVIGATION
  // =========================================================

  function showView(view, options = {}) {
    const {
      pushStack = true,
      updateAddress = true
    } = options;

    if (!VIEWS.includes(view) || !$('#view-' + view)) {
      view = 'home';
    }

    const previous = state.currentView;

    if (pushStack && previous && previous !== view) {
      state.previousViews.push(previous);

      if (state.previousViews.length > 30) {
        state.previousViews.shift();
      }
    }

    state.currentView = view;

    $$('[data-view]').forEach(section => {
      const active = section.dataset.view === view;

      section.hidden = !active;
      section.classList.toggle('active', active);
    });

    $$('[data-route]').forEach(link => {
      if (link.matches('.main-nav a')) {
        link.classList.toggle('active', link.dataset.route === view);
      }
    });

    document.body.dataset.screen = view;

    $('#mainNav')?.classList.remove('open');
    $('#menuToggle')?.setAttribute('aria-expanded', 'false');

    if (updateAddress && window.location.hash !== `#${view}`) {
      window.history.pushState({ view }, '', `#${view}`);
    }

    if (view === 'history') renderHistory();
    if (view === 'account') updateAccountUI();

    if (view === 'result' && state.report) {
      renderReport(state.report);
    }
  }

  function navigateBack() {
    const destination = state.previousViews.pop() || 'home';

    showView(destination, {
      pushStack: false
    });
  }

  function initNavigation() {
    document.addEventListener('click', event => {
      const routeControl = event.target.closest('[data-route]');

      if (routeControl) {
        event.preventDefault();
        showView(routeControl.dataset.route);
        return;
      }

      if (event.target.closest('[data-back]')) {
        event.preventDefault();
        navigateBack();
      }
    });

    window.addEventListener('popstate', () => {
      const candidate = window.location.hash.replace('#', '') || 'home';

      showView(VIEWS.includes(candidate) ? candidate : 'home', {
        pushStack: false,
        updateAddress: false
      });
    });

    $('#menuToggle')?.addEventListener('click', () => {
      const nav = $('#mainNav');
      const isOpen = nav?.classList.toggle('open') || false;

      $('#menuToggle')?.setAttribute('aria-expanded', String(isOpen));
    });

    const initial = window.location.hash.replace('#', '');

    showView(VIEWS.includes(initial) ? initial : 'home', {
      pushStack: false,
      updateAddress: false
    });
  }

  // =========================================================
  // TOASTS + THEME
  // =========================================================

  function toast(message, type = 'info', duration = 3600) {
    const region = $('#toastRegion');
    if (!region) return;

    const item = document.createElement('div');

    item.className = `toast ${type}`;
    item.setAttribute('role', type === 'error' ? 'alert' : 'status');
    item.textContent = message;

    region.append(item);

    window.setTimeout(() => item.remove(), duration);
  }

  function initTheme() {
    let saved = 'dark';

    try {
      saved = localStorage.getItem('aiImageDetector.theme') || 'dark';
    } catch {
      // Browser storage may be unavailable.
    }

    if (saved === 'light') {
      document.documentElement.classList.add('light-theme');
    }

    const updateButton = () => {
      const isLight = document.documentElement.classList.contains('light-theme');
      const button = $('#themeToggle');

      if (!button) return;

      button.textContent = isLight ? '☾' : '☼';

      button.setAttribute(
        'aria-label',
        isLight ? 'Switch to dark theme' : 'Switch to light theme'
      );
    };

    updateButton();

    $('#themeToggle')?.addEventListener('click', () => {
      const isLight = document.documentElement.classList.toggle('light-theme');

      try {
        localStorage.setItem(
          'aiImageDetector.theme',
          isLight ? 'light' : 'dark'
        );
      } catch {
        // Theme still works for the current page.
      }

      updateButton();
    });
  }

  // =========================================================
  // IMAGE READING + VALIDATION
  // =========================================================

  async function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => resolve(String(reader.result || ''));

      reader.onerror = () => {
        reject(new Error('Could not read this image. Please try another file.'));
      };

      reader.readAsDataURL(file);
    });
  }

  async function makePhotoThumbnail(dataUrl, maxEdge = 520) {
    const image = new Image();

    image.decoding = 'async';
    image.src = dataUrl;

    await new Promise((resolve, reject) => {
      image.onload = resolve;

      image.onerror = () => {
        reject(new Error('This file could not be opened as an image.'));
      };
    });

    const width = image.naturalWidth;
    const height = image.naturalHeight;

    if (!width || !height) {
      throw new Error('The selected file has no readable image dimensions.');
    }

    const scale = Math.min(1, maxEdge / Math.max(width, height));

    const canvas = document.createElement('canvas');

    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));

    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Image preview is not supported by this browser.');
    }

    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    return {
      width,
      height,
      thumbnail: canvas.toDataURL('image/jpeg', 0.68)
    };
  }

  function showUploadError(message) {
    const error = $('#uploadError');
    if (!error) return;

    error.textContent = message;
    error.classList.toggle('hidden', !message);
  }

  async function acceptImage(file) {
    showUploadError('');

    if (!file) return;

    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp'
    ];

    if (!allowedTypes.includes(file.type)) {
      showUploadError('Please choose a JPG, PNG, or WEBP image.');

      toast(
        'Only JPG, PNG, and WEBP image files are supported.',
        'error'
      );

      return;
    }

    if (file.size > MAX_IMAGE_SIZE) {
      showUploadError('This image is over 15 MB. Please choose a smaller image.');

      toast('The maximum supported image size is 15 MB.', 'error');

      return;
    }

    const button = $('#heroUploadBtn');

    if (button) button.disabled = true;

    try {
      const dataUrl = await fileToDataUrl(file);
      const scaled = await makePhotoThumbnail(dataUrl);

      state.photo = {
        file,
        name: file.name,
        type: file.type,
        size: file.size,
        dataUrl,
        thumbnail: scaled.thumbnail,
        width: scaled.width,
        height: scaled.height
      };

      toast('Image selected. Sending it for analysis…', 'success');

      await startAnalysis();
    } catch (error) {
      showUploadError(error.message || 'The image could not be opened.');

      toast(
        error.message || 'Could not open the selected image.',
        'error'
      );
    } finally {
      if (button) button.disabled = false;
    }
  }

  function initUpload() {
    $('#heroUploadBtn')?.addEventListener('click', () => {
      $('#photoInput')?.click();
    });

    $('#photoInput')?.addEventListener('change', event => {
      const file = event.target.files?.[0];

      if (file) acceptImage(file);
    });

    $('#photoInput')?.addEventListener('cancel', () => {
      showUploadError('');
    });
  }

  // =========================================================
  // BACKEND RESPONSE NORMALIZATION
  // The frontend never invents a confidence percentage.
  // =========================================================

  function firstValue(objects, keys) {
    for (const object of objects) {
      if (!object || typeof object !== 'object') continue;

      for (const key of keys) {
        const value = object[key];

        if (value !== undefined && value !== null && value !== '') {
          return value;
        }
      }
    }

    return null;
  }

  function normalizeScore(value) {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const numeric = Number(value);

    if (!Number.isFinite(numeric)) return null;

    // Supports scores represented as 0..1 or 0..100.
    const percentage =
      numeric >= 0 && numeric <= 1
        ? numeric * 100
        : numeric;

    if (percentage < 0 || percentage > 100) return null;

    return Math.round(percentage * 10) / 10;
  }

  function normalizeBackendResult(payload, photo) {
    const root = payload && typeof payload === 'object'
      ? payload
      : {};

    const data = root.data && typeof root.data === 'object'
      ? root.data
      : {};

    const predictionObject =
      root.prediction && typeof root.prediction === 'object'
        ? root.prediction
        : {};

    const objects = [
      root,
      data,
      predictionObject
    ];

    const rawLabel = firstValue(objects, [
      'label',
      'predicted_label',
      'prediction',
      'verdict',
      'classification',
      'result',
      'class_name'
    ]);

    const rawScore = firstValue(objects, [
      'confidence',
      'confidence_score',
      'probability',
      'score',
      'ai_probability',
      'fake_probability',
      'prediction_probability',
      'confidence_percent'
    ]);

    const summary = firstValue(objects, [
      'explanation',
      'summary',
      'message',
      'details',
      'reason',
      'description'
    ]);

    const engine =
      firstValue(objects, [
        'model_name',
        'model',
        'engine',
        'detector'
      ]) || 'Connected AI model';

    const scoreLabel =
      firstValue(objects, [
        'score_label',
        'confidence_label'
      ]) || 'Model confidence';

    const rawArtifacts = firstValue(objects, [
      'artifacts',
      'manipulation_details',
      'findings',
      'signals'
    ]);

    const label = rawLabel === null
      ? null
      : String(
          typeof rawLabel === 'object'
            ? (rawLabel.label || rawLabel.class || '')
            : rawLabel
        ).trim();

    let artifacts = '';

    if (Array.isArray(rawArtifacts)) {
      artifacts = rawArtifacts.map(String).join(' · ');
    } else if (rawArtifacts && typeof rawArtifacts === 'object') {
      artifacts = Object.entries(rawArtifacts)
        .map(([key, value]) => {
          const displayValue = typeof value === 'string'
            ? value
            : JSON.stringify(value);

          return `${key}: ${displayValue}`;
        })
        .join(' · ');
    } else if (rawArtifacts !== null) {
      artifacts = String(rawArtifacts);
    }

    if (!label && normalizeScore(rawScore) === null) {
      const backendMessage = firstValue(objects, [
        'error',
        'detail'
      ]);

      throw new Error(
        backendMessage
          ? String(backendMessage)
          : 'The backend response did not include a prediction or confidence score. Check the API response format.'
      );
    }

    return {
      id: makeReportId(),
      createdAt: new Date().toISOString(),

      fileName: photo.name,
      fileType: photo.type || 'image/unknown',
      fileSize: photo.size,
      width: photo.width,
      height: photo.height,

      imageDataUrl: photo.thumbnail,

      // Null means the backend did not provide a valid score.
      score: normalizeScore(rawScore),
      scoreLabel: String(scoreLabel),

      resultTitle: label || 'Prediction returned without a label',

      summary: summary === null
        ? 'The connected model did not return an explanation.'
        : String(summary),

      artifacts,
      engine: String(engine),
      rawLabel: label || '',
      savedAt: null
    };
  }

  function makeReportId() {
    const createdAt = new Date().toISOString();
    const dateToken = createdAt.replace(/\D/g, '').slice(0, 14);
    const randomToken = Math.random().toString(36).slice(2, 7).toUpperCase();

    return `IMG-${dateToken}-${randomToken}`;
  }

  // =========================================================
  // ANALYSIS PROGRESS
  // Progress is a UI indicator, not an AI confidence score.
  // =========================================================

  function setStep(id, status) {
    const element = $('#' + id);

    if (!element) return;

    element.classList.remove('active', 'completed');
    element.classList.add(status);

    const tag = $('.step-status', element);

    if (tag) {
      tag.textContent =
        status === 'completed'
          ? 'COMPLETE'
          : status === 'active'
            ? 'IN PROGRESS'
            : 'WAITING';
    }

    const number = $('.step-number', element);

    if (number && status === 'completed') {
      number.textContent = '✓';
    }
  }

  function resetAnalysisUI() {
    [
      ['stepUpload', '01'],
      ['stepVision', '02'],
      ['stepReport', '03']
    ].forEach(([id, initialNumber]) => {
      const element = $('#' + id);

      element?.classList.remove('active', 'completed');

      const number = element
        ? $('.step-number', element)
        : null;

      if (number) number.textContent = initialNumber;

      const status = element
        ? $('.step-status', element)
        : null;

      if (status) status.textContent = 'WAITING';
    });

    setProgress(0);
  }

  function setProgress(percent) {
    const amount = Math.max(0, Math.min(100, percent));

    if ($('#progressFill')) {
      $('#progressFill').style.width = `${Math.round(amount)}%`;
    }

    if ($('#progressPercent')) {
      $('#progressPercent').textContent = `${Math.round(amount)}%`;
    }
  }

  // =========================================================
  // SEND IMAGE TO FASTAPI BACKEND
  // =========================================================

  async function postImageToBackend(photo, signal) {
    const formData = new FormData();

    formData.append(
      API_FILE_FIELD,
      photo.file,
      photo.name
    );

    let response;

    try {
      response = await fetch(API_ENDPOINT, {
        method: 'POST',
        body: formData,
        signal
      });
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('The analysis request timed out. Please try again.');
      }

      throw new Error(
        `Could not reach the AI backend at ${API_ENDPOINT}. Check that FastAPI is running and CORS is enabled.`
      );
    }

    const bodyText = await response.text();

    let payload;

    try {
      payload = bodyText ? JSON.parse(bodyText) : {};
    } catch {
      throw new Error(
        'The backend returned a response that is not valid JSON.'
      );
    }

    if (!response.ok) {
      const detail =
        payload?.detail ||
        payload?.error ||
        `Backend request failed (${response.status}).`;

      throw new Error(
        typeof detail === 'string'
          ? detail
          : JSON.stringify(detail)
      );
    }

    if (payload?.success === false) {
      throw new Error(
        String(
          payload.message ||
          payload.error ||
          'The model could not analyze this image.'
        )
      );
    }

    return payload;
  }

  async function startAnalysis() {
    if (!state.photo || state.analyzing) return;

    state.analyzing = true;

    const run = ++state.runId;
    const photo = state.photo;

    resetAnalysisUI();

    if ($('#analysisPreview')) {
      $('#analysisPreview').src = photo.dataUrl;
    }

    setText('#analysisFileName', photo.name);

    setText(
      '#analysisFileMeta',
      `${photo.width} × ${photo.height} · ${formatBytes(photo.size)}`
    );

    setText('#analysisTitle', 'Preparing image');

    setText(
      '#analysisDescription',
      'Checking the file and preparing a request for the connected AI model.'
    );

    showView('analysis');

    const controller = new AbortController();

    const timeoutId = window.setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS
    );

    try {
      setStep('stepUpload', 'active');
      setProgress(15);

      await pause(160);

      if (run !== state.runId) return;

      setStep('stepUpload', 'completed');
      setStep('stepVision', 'active');

      setProgress(35);

      setText('#analysisTitle', 'Analyzing with AI model');

      setText(
        '#analysisDescription',
        'The image has been sent to the backend. Waiting for the model response.'
      );

      const payload = await postImageToBackend(
        photo,
        controller.signal
      );

      if (run !== state.runId) return;

      setProgress(82);
      setStep('stepVision', 'completed');
      setStep('stepReport', 'active');

      setText('#analysisTitle', 'Preparing model report');

      setText(
        '#analysisDescription',
        'Formatting the prediction returned by the backend.'
      );

      const report = normalizeBackendResult(payload, photo);

      setProgress(100);
      setStep('stepReport', 'completed');

      state.report = report;

      const user = getSessionUser();

      if (user) {
        saveReportForUser(user.email, state.report);
      }

      renderReport(state.report);
      resetChatForReport(state.report);
      showView('result');

      state.photo = null;

      if ($('#photoInput')) {
        $('#photoInput').value = '';
      }

      showUploadError('');

      toast(
        user
          ? 'Model analysis completed and report saved to your local account.'
          : 'Model analysis completed. Review or save the report.',
        'success'
      );
    } catch (error) {
      if (run !== state.runId) return;

      setProgress(0);
      setStep('stepUpload', 'completed');
      setStep('stepVision', 'active');

      setText('#analysisTitle', 'Analysis could not be completed');

      setText(
        '#analysisDescription',
        error.message ||
          'The backend did not return a usable model result. Check the API and try again.'
      );

      toast(
        error.message || 'The backend analysis failed.',
        'error',
        6000
      );
    } finally {
      window.clearTimeout(timeoutId);

      if (run === state.runId) {
        state.analyzing = false;
      }
    }
  }

  // =========================================================
  // REPORT RENDERING
  // The displayed score is always supplied by the backend.
  // =========================================================

  function renderReport(report) {
    if (!report) return;

    const image = $('#resultImage');
    const empty = $('#emptyResultImage');

    if (report.imageDataUrl && image) {
      image.src = report.imageDataUrl;
      image.alt = `Preview for ${report.fileName || 'uploaded image'}`;
      image.style.display = 'block';

      if (empty) empty.style.display = 'none';
    } else {
      image?.removeAttribute('src');

      if (image) image.style.display = 'none';
      if (empty) empty.style.display = 'flex';
    }

    setText('#resultFileName', report.fileName || '—');

    setText(
      '#resultFileType',
      (report.fileType || 'image/unknown')
        .replace('image/', '')
        .toUpperCase()
    );

    setText('#resultFileSize', formatBytes(report.fileSize));

    setText(
      '#resultDimensions',
      report.width && report.height
        ? `${report.width} × ${report.height}px`
        : '—'
    );

    setText('#reportId', report.id || '—');
    setText('#reportDate', formatDate(report.createdAt));

    setText(
      '#resultVerdict',
      report.resultTitle || 'No prediction label returned'
    );

    setText(
      '#resultSummary',
      report.summary || 'The model did not return an explanation.'
    );

    setText(
      '#analysisEngine',
      report.engine || 'Connected AI model'
    );

    const scoreElement = $('#resultScore');
    const scoreRing = $('.score-ring');
    const scoreMeter = $('.score-meter');

    const scoreAvailable = Number.isFinite(report.score);

    if (scoreElement) {
      scoreElement.textContent = scoreAvailable
        ? `${report.score.toLocaleString(undefined, {
            maximumFractionDigits: 1
          })}%`
        : '—';
    }

    if (scoreRing) {
      scoreRing.style.setProperty(
        '--score-angle',
        scoreAvailable
          ? `${report.score * 3.6}deg`
          : '0deg'
      );

      scoreRing.classList.toggle(
        'score-unavailable',
        !scoreAvailable
      );

      scoreRing.setAttribute(
        'aria-label',
        scoreAvailable
          ? `${report.score}% ${report.scoreLabel || 'model confidence'}`
          : 'The model did not return a confidence score'
      );
    }

    if (scoreMeter) {
      scoreMeter.classList.toggle(
        'score-unavailable',
        !scoreAvailable
      );
    }

    const scoreLabelElement =
      $('#resultScoreLabel') ||
      $('.score-meter > div:last-child small');

    if (scoreLabelElement) {
      scoreLabelElement.textContent = scoreAvailable
        ? report.scoreLabel || 'Model confidence'
        : 'No score returned by model';
    }

    const explanation =
      $('#resultExplanationText') ||
      $('.result-explanation p');

    if (explanation) {
      const artifacts = report.artifacts
        ? ` Model findings: ${report.artifacts}`
        : '';

      explanation.textContent =
        `${report.summary || 'No explanation was returned by the model.'}${artifacts}`;
    }

    const resultBadge =
      $('#resultModeBadge') ||
      $('.demo-chip');

    if (resultBadge) {
      resultBadge.textContent = report.engine || 'BACKEND RESULT';
      resultBadge.classList.remove('demo-chip');
    }

    updateSaveButton();
  }

  // =========================================================
  // LOCAL DEMO ACCOUNT STORAGE
  // This is browser-only storage, not production authentication.
  // =========================================================

  function readUsers() {
    try {
      const users = safeParse(
        localStorage.getItem(USERS_KEY),
        []
      );

      return Array.isArray(users) ? users : [];
    } catch {
      return [];
    }
  }

  function getSessionUser() {
    let session;

    try {
      session = safeParse(
        sessionStorage.getItem(SESSION_KEY),
        null
      );
    } catch {
      return null;
    }

    const email = normalizedEmail(session?.email);

    return email
      ? readUsers().find(
          user => normalizedEmail(user.email) === email
        ) || null
      : null;
  }

  function setSession(email) {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        email: normalizedEmail(email),
        at: Date.now()
      })
    );
  }

  function createSalt() {
    const bytes = new Uint8Array(16);

    window.crypto.getRandomValues(bytes);

    return [...bytes]
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  async function hashPassword(password, salt) {
    if (
      !window.crypto?.subtle ||
      !window.TextEncoder ||
      !window.crypto?.getRandomValues
    ) {
      throw new Error(
        'Secure password hashing is unavailable. Run this page using a local development server such as VS Code Live Server.'
      );
    }

    const bytes = new TextEncoder().encode(
      `${salt}:${password}`
    );

    const digest = await window.crypto.subtle.digest(
      'SHA-256',
      bytes
    );

    return [...new Uint8Array(digest)]
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  function reportsKey(email) {
    return `aiImageDetector.reports.${normalizedEmail(email)}`;
  }

  function readReports(email) {
    try {
      const key = email
        ? reportsKey(email)
        : GUEST_REPORTS_KEY;

      const reports = safeParse(
        localStorage.getItem(key),
        []
      );

      return Array.isArray(reports) ? reports : [];
    } catch {
      return [];
    }
  }

  function writeReports(email, reports) {
    const key = email
      ? reportsKey(email)
      : GUEST_REPORTS_KEY;

    localStorage.setItem(
      key,
      JSON.stringify(reports.slice(0, MAX_REPORTS))
    );
  }

  function saveReportForUser(email, report) {
    try {
      const records = readReports(email);

      const existingIndex = records.findIndex(
        item => item.id === report.id
      );

      const stored = {
        ...report,
        savedAt: new Date().toISOString()
      };

      if (existingIndex >= 0) {
        records[existingIndex] = stored;
      } else {
        records.unshift(stored);
      }

      writeReports(email, records);

      if (state.report?.id === report.id) {
        state.report = stored;
      }

      renderHistoryIfVisible();
      updateAccountUI();
      updateSaveButton();

      return true;
    } catch (error) {
      console.error('Could not save report locally:', error);

      toast(
        'Browser storage is full. Clear older reports and try again.',
        'error'
      );

      return false;
    }
  }

  function migrateGuestReports(email) {
    const guest = readReports(null);

    if (!guest.length) return;

    const owned = readReports(email);
    const ids = new Set(owned.map(report => report.id));

    writeReports(
      email,
      [
        ...owned,
        ...guest.filter(report => !ids.has(report.id))
      ].slice(0, MAX_REPORTS)
    );

    try {
      localStorage.removeItem(GUEST_REPORTS_KEY);
    } catch {
      // Storage may be disabled.
    }
  }

  function updateSaveButton() {
    const button = $('#saveReportButton');

    if (!button) return;

    const user = getSessionUser();

    const saved = Boolean(
      state.report &&
      readReports(user?.email || null).some(
        report => report.id === state.report.id
      )
    );

    if (saved) {
      button.textContent = user
        ? '✓ Saved to my reports'
        : '✓ Saved in this browser';

      button.disabled = true;
    } else {
      button.innerHTML = 'Save to my reports <span>＋</span>';
      button.disabled = false;
    }

    $('#reportSignInButton')?.classList.toggle(
      'hidden',
      Boolean(user)
    );
  }

  function saveCurrentReportToLibrary() {
    if (!state.report) {
      toast(
        'Analyze an image first to create a report.',
        'warning'
      );

      return;
    }

    const user = getSessionUser();

    if (
      saveReportForUser(
        user?.email || null,
        state.report
      )
    ) {
      state.report = {
        ...state.report,
        savedAt: state.report.savedAt || new Date().toISOString()
      };

      updateSaveButton();

      toast(
        user
          ? 'Report saved under your local account.'
          : 'Report saved in this browser. Create an account to organize reports.',
        'success'
      );
    }
  }

  function updateAccountUI() {
    const user = getSessionUser();

    const profile = $('#accountProfile');
    const forms = $('#authForms');

    profile?.classList.toggle('hidden', !user);
    forms?.classList.toggle('hidden', Boolean(user));

    if (user) {
      setText(
        '#profileAvatar',
        (user.name || user.email || 'A')
          .trim()
          .charAt(0)
          .toUpperCase()
      );

      setText(
        '#profileName',
        `Welcome, ${user.name || 'there'}`
      );

      setText('#profileEmail', user.email);

      setText(
        '#profileReportCount',
        String(readReports(user.email).length)
      );

      const accountButton = $('#accountButton');

      if (accountButton) {
        accountButton.innerHTML = 'My account <span>↗</span>';
      }
    } else {
      const accountButton = $('#accountButton');

      if (accountButton) {
        accountButton.innerHTML = 'Sign in <span>↗</span>';
      }
    }

    updateSaveButton();
  }

  function authError(element, message) {
    if (!element) return;

    element.textContent = message;
    element.classList.remove('hidden');
  }

  function setAuthMode(mode) {
    const signup = mode === 'signup';

    $('#signUpForm')?.classList.toggle('hidden', !signup);
    $('#signInForm')?.classList.toggle('hidden', signup);

    $('#showSignUp')?.classList.toggle('active', signup);
    $('#showSignIn')?.classList.toggle('active', !signup);

    $('#signUpError')?.classList.add('hidden');
    $('#signInError')?.classList.add('hidden');
  }

  function initAuth() {
    $$('[data-auth-mode]').forEach(button => {
      button.addEventListener('click', () => {
        setAuthMode(button.dataset.authMode);
      });
    });

    $('#signUpForm')?.addEventListener('submit', async event => {
      event.preventDefault();

      const form = event.currentTarget;

      const name = $('#signUpName')?.value.trim() || '';
      const email = normalizedEmail($('#signUpEmail')?.value);
      const password = $('#signUpPassword')?.value || '';
      const confirm = $('#signUpConfirm')?.value || '';

      const error = $('#signUpError');

      error?.classList.add('hidden');

      if (name.length < 2) {
        return authError(error, 'Please enter your name.');
      }

      if (!email.includes('@') || !email.includes('.')) {
        return authError(error, 'Enter a valid email address.');
      }

      if (password.length < 8) {
        return authError(
          error,
          'Use a password with at least 8 characters.'
        );
      }

      if (password !== confirm) {
        return authError(error, 'The passwords do not match.');
      }

      const users = readUsers();

      if (
        users.some(user => normalizedEmail(user.email) === email)
      ) {
        return authError(
          error,
          'An account with this email already exists in this browser. Sign in instead.'
        );
      }

      const submit = $('button[type="submit"]', form);

      if (submit) submit.disabled = true;

      try {
        const salt = createSalt();

        const passwordHash = await hashPassword(
          password,
          salt
        );

        users.push({
          name,
          email,
          salt,
          passwordHash,
          createdAt: new Date().toISOString()
        });

        localStorage.setItem(
          USERS_KEY,
          JSON.stringify(users)
        );

        setSession(email);
        migrateGuestReports(email);
        updateAccountUI();
        renderHistory();
        showView('history');

        toast(
          'Your demo account is ready in this browser.',
          'success'
        );
      } catch (err) {
        authError(
          error,
          err.message || 'Could not create this demo account.'
        );
      } finally {
        if (submit) submit.disabled = false;
      }
    });

    $('#signInForm')?.addEventListener('submit', async event => {
      event.preventDefault();

      const form = event.currentTarget;

      const email = normalizedEmail($('#signInEmail')?.value);
      const password = $('#signInPassword')?.value || '';

      const error = $('#signInError');

      error?.classList.add('hidden');

      const user = readUsers().find(
        item => normalizedEmail(item.email) === email
      );

      if (!user) {
        return authError(
          error,
          'No local demo account matches this email. Create an account first.'
        );
      }

      const submit = $('button[type="submit"]', form);

      if (submit) submit.disabled = true;

      try {
        const passwordHash = await hashPassword(
          password,
          user.salt || 'legacy-demo'
        );

        if (passwordHash !== user.passwordHash) {
          return authError(
            error,
            'The email or password is incorrect.'
          );
        }

        setSession(email);
        migrateGuestReports(email);
        updateAccountUI();
        renderHistory();
        showView('history');

        toast(
          'Signed in to your local demo profile.',
          'success'
        );
      } catch (err) {
        authError(
          error,
          err.message || 'Could not sign in.'
        );
      } finally {
        if (submit) submit.disabled = false;
      }
    });

    $('#signOutButton')?.addEventListener('click', () => {
      try {
        sessionStorage.removeItem(SESSION_KEY);
      } catch {
        // Storage may be disabled.
      }

      updateAccountUI();
      renderHistory();
      showView('home');

      toast(
        'You have signed out of this browser profile.',
        'success'
      );
    });

    updateAccountUI();
  }

  // =========================================================
  // REPORT HISTORY
  // =========================================================

  function renderHistoryIfVisible() {
    if (state.currentView === 'history') {
      renderHistory();
    }
  }

  function renderHistory() {
    const tbody = $('#historyBody');

    if (!tbody) return;

    tbody.replaceChildren();

    const user = getSessionUser();

    const reports = readReports(user?.email || null).sort(
      (a, b) =>
        new Date(b.savedAt || b.createdAt) -
        new Date(a.savedAt || a.createdAt)
    );

    setText(
      '#historyCount',
      `${reports.length} report${reports.length === 1 ? '' : 's'}`
    );

    if (!reports.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');

      cell.colSpan = 6;
      cell.className = 'empty-table-cell';

      cell.textContent = user
        ? 'No reports saved to this account yet. Analyze an image to create your first report.'
        : 'No reports saved in this browser yet. Analyze an image and save the report here, or create an account.';

      row.append(cell);
      tbody.append(row);

      return;
    }

    for (const report of reports) {
      const row = document.createElement('tr');

      const photoCell = document.createElement('td');
      const photoWrap = document.createElement('div');

      photoWrap.className = 'history-image-cell';

      const photo = document.createElement('img');

      photo.className = 'history-image';
      photo.alt = '';

      if (report.imageDataUrl) {
        photo.src = report.imageDataUrl;
      }

      const name = document.createElement('span');

      name.className = 'history-image-name';
      name.textContent = report.fileName || 'Saved image';

      photoWrap.append(photo, name);
      photoCell.append(photoWrap);
      row.append(photoCell);

      appendCell(row, report.id || '—');
      appendCell(row, shortDate(report.createdAt));

      appendCell(
        row,
        Number.isFinite(report.score)
          ? `${report.score}%`
          : 'Not returned'
      );

      appendCell(
        row,
        report.resultTitle || 'No label'
      );

      const actionCell = document.createElement('td');
      const openButton = document.createElement('button');

      openButton.className = 'history-action';
      openButton.type = 'button';
      openButton.textContent = 'Open report';

      openButton.addEventListener('click', () => {
        state.report = report;

        renderReport(report);
        resetChatForReport(report);
        showView('result');
      });

      actionCell.append(openButton);
      row.append(actionCell);
      tbody.append(row);
    }
  }

  function appendCell(row, value) {
    const cell = document.createElement('td');

    cell.textContent = value;
    row.append(cell);
  }

  function initReportStorage() {
    $('#saveReportButton')?.addEventListener(
      'click',
      saveCurrentReportToLibrary
    );

    $('#clearHistoryButton')?.addEventListener('click', () => {
      const user = getSessionUser();
      const reports = readReports(user?.email || null);

      if (!reports.length) {
        return toast('There are no reports to clear.', 'info');
      }

      if (
        !window.confirm(
          'Clear the report list saved in this browser profile? This cannot be undone.'
        )
      ) {
        return;
      }

      try {
        if (user) {
          localStorage.removeItem(reportsKey(user.email));
        } else {
          localStorage.removeItem(GUEST_REPORTS_KEY);
        }
      } catch {
        // Storage may be disabled.
      }

      renderHistory();
      updateAccountUI();
      updateSaveButton();

      toast(
        'The local report list has been cleared.',
        'success'
      );
    });

    $('#reportSignInButton')?.addEventListener('click', () => {
      setAuthMode('signup');
      showView('account');
    });
  }

  // =========================================================
  // REPORT CHAT
  // =========================================================

  function addChatMessage(role, text) {
    const messages = $('#chatMessages');

    if (!messages) return;

    const row = document.createElement('div');
    row.className = `chat-message ${role}`;

    const avatar = document.createElement('span');

    avatar.className = 'message-avatar';
    avatar.textContent = role === 'user' ? 'YOU' : 'AI';

    const bubble = document.createElement('div');

    bubble.className = 'message-bubble';
    bubble.textContent = text;

    row.append(avatar, bubble);
    messages.append(row);

    messages.scrollTop = messages.scrollHeight;
  }

  function resetChatForReport(report) {
    const messages = $('#chatMessages');

    if (!messages) return;

    messages.replaceChildren();

    addChatMessage(
      'bot',
      report
        ? `This report is for "${report.fileName || 'your image'}". I can explain the model label, any confidence score the backend returned, file details, report ID, or the limits of the result.`
        : 'Hi! Ask me about image details, report fields, or what is needed for AI-image detection.'
    );
  }

  function answerReportQuestion(question, report) {
    const q = String(question || '').toLowerCase();

    if (!report) {
      return 'Upload and analyze an image first, then I can answer questions about the report.';
    }

    if (
      /(score|confidence|percentage|percent|نسب|درج|الرقم|النتيج|احتمال)/i.test(q)
    ) {
      return Number.isFinite(report.score)
        ? `The connected model returned ${report.score}% (${report.scoreLabel || 'model confidence'}). This is the model-provided value; how it should be interpreted depends on the model's validation and output definition.`
        : 'The backend did not return a confidence score for this report, so the interface does not invent one. The prediction label and explanation are shown separately when available.';
    }

    if (
      /(file|image|photo|picture|اسم|الصوره|الصورة|الملف|نوع|حجم|ابعاد|أبعاد|dimensions|size|format)/i.test(q)
    ) {
      return `Image details:
• Name: ${report.fileName || '—'}
• Type: ${(report.fileType || 'image/unknown').replace('image/', '').toUpperCase()}
• Size: ${formatBytes(report.fileSize)}
• Dimensions: ${report.width || '—'} × ${report.height || '—'} pixels
• Report ID: ${report.id || '—'}`;
    }

    if (
      /(report|pdf|download|export|تقرير|احفظ|تنزيل|تحميل|اطبع|صدر)/i.test(q)
    ) {
      return 'Select “Export PDF” on the report page. In the print dialog, choose “Save as PDF”. The export includes the image preview, file information, backend prediction fields, and a note that the output is not a guarantee of authenticity.';
    }

    if (
      /(real|actual|detect|model|ai-made|ai made|generated|authentic|حقيقي|فعلي|يكشف|كشف|ذكاء اصطناعي|معمول بال ai|نموذج)/i.test(q)
    ) {
      return `This report uses the backend response from: ${report.engine || 'the configured model'}. A model prediction is not an absolute guarantee; reliability depends on how the detector was trained and evaluated. Check the returned label and explanation before drawing conclusions.`;
    }

    if (
      /(how|steps|workflow|analy|بيشتغل|بيعمل|ازاي|إزاي|التحليل|خطوات)/i.test(q)
    ) {
      return 'The browser sends the selected image to the configured backend endpoint. The backend runs the connected model and returns a prediction response, which the website displays in the report. The website does not generate its own prediction score.';
    }

    if (
      /(privacy|private|upload|server|online|خصوص|بيترفع|السيرفر|البيانات)/i.test(q)
    ) {
      return 'When you analyze an image, this version sends the original file to the configured backend endpoint. Only connect to a backend you control or trust. Report history and demo-account details are stored in this browser and are not a production authentication system.';
    }

    if (
      /(hello|hi|hey|مرحبا|اهلا|أهلا|السلام)/i.test(q)
    ) {
      return 'Hello! Ask me about the model result, confidence score, image details, or exporting the report.';
    }

    return 'I can explain the returned prediction, model confidence (if supplied), image metadata, report ID, PDF export, and how the backend is connected. Try one of the quick questions.';
  }

  function sendChat(question) {
    const text = String(question || '').trim();

    if (!text) return;

    addChatMessage('user', text);

    const answer = answerReportQuestion(
      text,
      state.report
    );

    window.setTimeout(() => {
      addChatMessage('bot', answer);
    }, 180);

    if ($('#chatInput')) {
      $('#chatInput').value = '';
    }
  }

  function initChat() {
    $('#chatForm')?.addEventListener('submit', event => {
      event.preventDefault();
      sendChat($('#chatInput')?.value || '');
    });

    $$('[data-chat-prompt]').forEach(button => {
      button.addEventListener('click', () => {
        sendChat(button.dataset.chatPrompt);
      });
    });

    resetChatForReport(state.report);
  }

  // =========================================================
  // PDF EXPORT
  // =========================================================

  function exportReportAsPdf() {
    const report = state.report;

    if (!report) {
      return toast(
        'Analyze an image first to create a report.',
        'warning'
      );
    }

    const printWindow = window.open(
      '',
      '_blank',
      'width=950,height=780'
    );

    if (!printWindow) {
      return toast(
        'Your browser blocked the report window. Allow pop-ups and try again.',
        'error'
      );
    }

    const imageHtml = report.imageDataUrl
      ? `<img class="report-image" src="${report.imageDataUrl}" alt="Uploaded image">`
      : '<p>No image preview was saved with this report.</p>';

    const scoreText = Number.isFinite(report.score)
      ? `${report.score}% (${report.scoreLabel || 'model confidence'})`
      : 'Not provided by the backend';

    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Image report ${escapeHtml(report.id)}</title>
<style>
@page{size:A4;margin:16mm}
*{box-sizing:border-box}
body{font:12px/1.65 Arial,sans-serif;color:#172f38;margin:0}
header{border-bottom:3px solid #069db8;padding-bottom:14px;margin-bottom:18px}
header small{color:#0089a2;font-weight:bold;letter-spacing:2px}
h1{font-size:25px;margin:5px 0}
h2{font-size:16px;margin:19px 0 8px}
p{margin:6px 0}
.meta{color:#526b74;font-size:11px}
.report-image{display:block;max-width:100%;max-height:90mm;object-fit:contain;margin:15px auto;border:1px solid #c7d4d9;padding:5px}
table{width:100%;border-collapse:collapse;margin-top:10px}
th,td{padding:8px;text-align:left;vertical-align:top;border:1px solid #cdd8dc;overflow-wrap:anywhere}
th{width:31%;background:#f0f8fa}
.note{margin-top:18px;padding:12px;border:1px solid #e7a45f;background:#fff8ee}
.footer{margin-top:22px;padding-top:9px;border-top:1px solid #d5dfe2;font-size:10px;color:#607780}
</style>
</head>
<body>
<header>
  <small>AI IMAGE DETECTOR</small>
  <h1>Image Analysis Report</h1>
  <div class="meta">Report ID: ${escapeHtml(report.id)} · Created: ${escapeHtml(formatDate(report.createdAt))}</div>
</header>

<h2>Uploaded image</h2>
${imageHtml}

<h2>File details and model response</h2>
<table>
<tr><th>File name</th><td>${escapeHtml(report.fileName)}</td></tr>
<tr><th>File type</th><td>${escapeHtml(report.fileType)}</td></tr>
<tr><th>File size</th><td>${escapeHtml(formatBytes(report.fileSize))}</td></tr>
<tr><th>Image dimensions</th><td>${escapeHtml(`${report.width || '—'} × ${report.height || '—'} pixels`)}</td></tr>
<tr><th>Model prediction</th><td>${escapeHtml(report.resultTitle || 'Not provided')}</td></tr>
<tr><th>Model confidence</th><td>${escapeHtml(scoreText)}</td></tr>
<tr><th>Explanation</th><td>${escapeHtml(report.summary || 'Not provided by the backend')}</td></tr>
<tr><th>Analysis engine</th><td>${escapeHtml(report.engine || 'Configured backend model')}</td></tr>
<tr><th>Report status</th><td>Backend response received; not a guarantee of authenticity</td></tr>
</table>

<div class="note">
  <b>Important note</b>
  <p>This report displays the response returned by the connected backend. A model score is not a guaranteed probability of authenticity unless the model has been calibrated and evaluated for that interpretation.</p>
</div>

<div class="footer">AI Image Detector · Analysis report</div>

<script>
window.addEventListener('load',()=>setTimeout(()=>{
  window.focus();
  window.print();
},350));
<\/script>
</body>
</html>`;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  }

  function initReportExport() {
    $('#downloadReport')?.addEventListener(
      'click',
      exportReportAsPdf
    );
  }

  // =========================================================
  // STARTUP
  // =========================================================

  function init() {
    initTheme();
    initNavigation();
    initUpload();
    initAuth();
    initReportStorage();
    initChat();
    initReportExport();

    renderHistory();
    updateAccountUI();
    updateSaveButton();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();