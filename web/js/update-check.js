// update-check.js — the app always starts from the cache; this script is the
// only thing that looks at the server meanwhile.
//
// Every so often it fetches /version.txt (which the service worker lets
// through to the network, uncached) and compares it with the name of the
// running cache. When the server has published another version it triggers
// the download in the background and shows a toast. Nothing the user is doing
// gets cut: the next load — the toast button, a reload, or opening the app
// tomorrow — is the new version.
//
// Adapted from the adding-pwa-auto-update skill. Two changes: the path is
// absolute, because this app has deep routes (/sessions/abc) and a relative
// "version.txt" would hit Apache's fallback and get index.html back; and the
// toast speaks the app's language and wears its theme.
(function () {
  'use strict';

  if (!('serviceWorker' in navigator)) { return; }

  var CHECK_EVERY_MS = 15 * 60 * 1000;
  var MIN_GAP_MS = 60 * 1000;
  var FIRST_CHECK_MS = 8000;

  var reg = null;
  var lastCheck = 0;
  var announced = false;

  function texts() {
    var es = (document.documentElement.lang || '').indexOf('es') === 0;
    return es
      ? { text: 'Hay una versión nueva de Decibeles.', button: 'Recargar' }
      : { text: 'A new version of Decibeles is available.', button: 'Reload' };
  }

  function showToast() {
    if (announced) { return; }
    announced = true;

    var style = document.createElement('style');
    style.textContent =
      '#update-toast{position:fixed;left:50%;transform:translate(-50%,150%);' +
      'bottom:calc(86px + env(safe-area-inset-bottom,0px));z-index:2147483647;' +
      // width:max-content: a fixed box with left:50% sizes itself against the
      // space left on its right, and the text would stack in a narrow column.
      'display:flex;align-items:center;gap:12px;width:max-content;max-width:calc(100vw - 24px);' +
      'box-sizing:border-box;padding:10px 10px 10px 16px;border:1px solid var(--accent);border-radius:14px;' +
      'background:var(--panel-2);box-shadow:0 14px 34px -14px rgba(0,0,0,.7);' +
      'font:600 14px/1.35 "Instrument Sans",system-ui,sans-serif;color:var(--ink);opacity:0;' +
      'transition:transform .35s ease-out,opacity .35s ease-out}' +
      '#update-toast.is-visible{transform:translate(-50%,0);opacity:1}' +
      '#update-toast button{flex:0 0 auto;cursor:pointer;padding:9px 14px;border:0;border-radius:10px;' +
      'background:var(--accent);color:var(--accent-ink);font:inherit;font-weight:700}' +
      '#update-toast button:disabled{opacity:.55;cursor:default}';
    document.head.appendChild(style);

    var tx = texts();
    var toastEl = document.createElement('div');
    toastEl.id = 'update-toast';
    toastEl.setAttribute('role', 'status');
    var text = document.createElement('span');
    text.textContent = tx.text;
    toastEl.appendChild(text);
    var button = document.createElement('button');
    button.type = 'button';
    button.textContent = tx.button;
    button.addEventListener('click', function () {
      button.disabled = true;
      button.textContent = '···';
      window.location.reload();
    });
    toastEl.appendChild(button);
    document.body.appendChild(toastEl);
    setTimeout(function () { toastEl.className = 'is-visible'; }, 30);
  }

  // Which version is running: ask the worker that controls the page. With no
  // controller nothing is cached, so there is nothing to announce either.
  function askWorker(callback) {
    var sw = navigator.serviceWorker.controller;
    if (!sw || !window.MessageChannel) { callback(null); return; }
    var channel = new MessageChannel();
    var answered = false;
    channel.port1.onmessage = function (event) {
      answered = true;
      callback((event.data && event.data.version) || null);
    };
    setTimeout(function () { if (!answered) { callback(null); } }, 3000);
    try {
      sw.postMessage({ type: 'GET_VERSION' }, [channel.port2]);
    } catch (e) {
      callback(null);
    }
  }

  // Fallback for a worker that does not answer: the cache names carry the
  // version too.
  function fromCacheNames(published, callback) {
    if (!window.caches || !caches.keys) { callback(null); return; }
    var prefix = published.replace(/-[^-]*$/, '-');
    caches.keys().then(function (keys) {
      var mine = [];
      for (var i = 0; i < keys.length; i++) {
        if (keys[i].indexOf(prefix) === 0) { mine.push(keys[i]); }
      }
      if (!mine.length) { callback(null); return; }
      callback(mine.indexOf(published) !== -1 ? published : mine[0]);
    })['catch'](function () { callback(null); });
  }

  function runningVersion(published, callback) {
    askWorker(function (version) {
      if (version) { callback(version); return; }
      fromCacheNames(published, callback);
    });
  }

  // Take the downloaded version out of "waiting". On activation it deletes the
  // old caches, so from then on any load is the new one.
  function activate(worker) {
    if (!worker) { return; }
    try { worker.postMessage({ type: 'SKIP_WAITING' }); } catch (e) {}
  }

  function check(force) {
    var now = Number(new Date());
    if (!force && now - lastCheck < MIN_GAP_MS) { return; }
    if (navigator.onLine === false) { return; }
    lastCheck = now;

    fetch('/version.txt?t=' + now, { cache: 'no-store' })
      .then(function (res) { return res.ok ? res.text() : null; })
      .then(function (published) {
        if (!published) { return; }
        published = published.replace(/^\s+|\s+$/g, '');
        // Guard against an HTML fallback page answering for a missing file.
        if (!published || published.length > 64 || published.indexOf('<') !== -1) { return; }
        runningVersion(published, function (running) {
          if (running === published) { return; }
          if (running) { showToast(); }
          if (reg) {
            activate(reg.waiting);
            try { reg.update(); } catch (e) {}
          }
        });
      })
      .catch(function () { /* offline: keep running from the cache */ });
  }

  // A version that finishes installing is news already. Only with a
  // controller: without one this is the first visit.
  function watch(worker) {
    if (!worker) { return; }
    if (worker.state === 'installed' || worker.state === 'activated') {
      if (navigator.serviceWorker.controller) { showToast(); activate(worker); }
      return;
    }
    worker.addEventListener('statechange', function () {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) {
        showToast();
        activate(worker);
      }
    });
  }

  navigator.serviceWorker.ready.then(function (registration) {
    reg = registration;
    reg.addEventListener('updatefound', function () { watch(reg.installing); });
    // On a reload the browser starts revalidating before this script runs, so
    // an update already on its way would be missed without these two.
    watch(reg.installing);
    watch(reg.waiting);
    setTimeout(function () { check(true); }, FIRST_CHECK_MS);
    setInterval(function () { check(false); }, CHECK_EVERY_MS);
  });

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { check(false); }
  });
})();
