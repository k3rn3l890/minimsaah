/**
 * MINIMSAAH — watch.js
 * Night-error watcher for public pages. Catches page crashes and failed
 * background calls, and reports them to the existing /api/log-event door
 * as site_error rows (page + short message). Max 3 reports per page view.
 * Fire-and-forget: never slows or breaks the page. Never throws.
 */
(function () {
  var seen = 0;
  function report(msg) {
    try {
      if (seen >= 3) return;
      seen++;
      var detail = (String(msg || 'page error') + ' @ ' + location.pathname).slice(0, 200);
      fetch('/api/log-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'site_error', email: '', success: false, detail: detail }),
      }).catch(function () {});
    } catch (e) {}
  }
  window.addEventListener('error', function (ev) {
    report((ev && ev.message) || 'script error');
  });
  window.addEventListener('unhandledrejection', function (ev) {
    var r = ev && ev.reason;
    report((r && r.message) || 'background call failed');
  });
})();
