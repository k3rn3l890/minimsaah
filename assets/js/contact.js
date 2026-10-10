/**
 * MINIMSAAH — contact.js
 * Floating red chat button + chat-style message panel on public pages.
 * Send saves to public.contact_messages (anon insert door enforces shapes
 * server-side too). Max 3 sends per hour per browser. Never throws.
 * Mail hook for later: point NOTIFY_URL at a mail door and every send
 * also pings the staff address. Leave '' to keep inbox-only.
 */
(function (global) {
  var NOTIFY_URL = '';
  var MAX_PER_HOUR = 3;

  function qs(sel, ctx) { return (ctx || document).querySelector(sel); }

  // Page <style> blocks vary, so the pulse ships with the script.
  function injectCss() {
    if (document.getElementById('contact-css')) return;
    var st = document.createElement('style');
    st.id = 'contact-css';
    st.textContent =
      '@keyframes contact-pulse{0%{box-shadow:0 0 0 0 rgba(230,57,70,0.55);}70%{box-shadow:0 0 0 14px rgba(230,57,70,0);}100%{box-shadow:0 0 0 0 rgba(230,57,70,0);}}' +
      '#contact-fab{animation:contact-pulse 2.4s ease-out infinite;}' +
      '#contact-fab:hover{animation-play-state:paused;}' +
      '@media (prefers-reduced-motion: reduce){#contact-fab{animation:none !important;}}';
    document.head.appendChild(st);
  }

  function useSupa() {
    return global.SupabaseDB && global.SupabaseDB.isEnabled();
  }

  function emailOk(v) {
    v = String(v || '').trim().toLowerCase();
    return v.length >= 3 && v.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : '';
  }

  function budgetLeft() {
    try {
      var now = Date.now();
      var list = JSON.parse(localStorage.getItem('ms_contact_times') || '[]');
      list = list.filter(function (t) { return now - t < 60 * 60 * 1000; });
      return { list: list, ok: list.length < MAX_PER_HOUR };
    } catch (e) { return { list: [], ok: true }; }
  }

  function budgetPush(list) {
    try {
      list.push(Date.now());
      localStorage.setItem('ms_contact_times', JSON.stringify(list));
    } catch (e) {}
  }

  function cuid() {
    try {
      if (global.crypto && typeof global.crypto.randomUUID === 'function') return global.crypto.randomUUID();
    } catch (e) {}
    return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function show(el, on) { el.classList.toggle('hidden', !on); }

  function setErr(msg) {
    var el = document.getElementById('contact-err');
    el.textContent = msg || '';
    show(el, !!msg);
  }

  function openPanel() {
    var fab = document.getElementById('contact-fab');
    var panel = document.getElementById('contact-panel');
    show(panel, true);
    fab.setAttribute('aria-expanded', 'true');
    setTimeout(function () {
      try { document.getElementById('contact-msg').focus(); } catch (e) {}
    }, 60);
  }

  function closePanel() {
    var fab = document.getElementById('contact-fab');
    var panel = document.getElementById('contact-panel');
    show(panel, false);
    fab.setAttribute('aria-expanded', 'false');
    try { fab.focus(); } catch (e) {}
  }

  function updateCount() {
    var msg = document.getElementById('contact-msg');
    var c = document.getElementById('contact-count');
    if (c) c.textContent = String(msg.value.length) + '/2000';
  }

  async function send(e) {
    if (e) e.preventDefault();
    setErr('');
    var nameEl = document.getElementById('contact-name');
    var emailEl = document.getElementById('contact-email');
    var msgEl = document.getElementById('contact-msg');
    var btn = document.getElementById('contact-send');
    var name = String(nameEl.value || '').replace(/^\s+|\s+$/g, '').slice(0, 200);
    var email = emailOk(emailEl.value);
    var message = String(msgEl.value || '').replace(/^\s+|\s+$/g, '').slice(0, 2000);
    if (!name) { setErr('Your name is needed.'); try { nameEl.focus(); } catch (x) {} return; }
    if (!email) { setErr('Email must look like name@site.'); try { emailEl.focus(); } catch (x) {} return; }
    if (message.length < 10) { setErr('Message needs at least 10 letters.'); try { msgEl.focus(); } catch (x) {} return; }
    if (!useSupa()) { setErr('Chat is offline right now — try again soon.'); return; }
    var b = budgetLeft();
    if (!b.ok) { setErr('Slow down. Max 3 messages per hour.'); return; }
    btn.disabled = true;
    btn.textContent = 'Sending…';
    try {
      var sb = global.SupabaseDB.client();
      var r = await sb.from('contact_messages').insert({
        id: cuid(), name: name, email: email, message: message,
      });
      if (r.error) throw new Error(r.error.message);
      budgetPush(b.list);
      // Later: notify the staff address. Fire-and-forget, never blocks.
      if (NOTIFY_URL) {
        fetch(NOTIFY_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name, email: email, message: message }),
        }).catch(function () {});
      }
      show(document.getElementById('contact-form-view'), false);
      show(document.getElementById('contact-done-view'), true);
      nameEl.value = ''; emailEl.value = ''; msgEl.value = ''; updateCount();
    } catch (ex) {
      setErr('Could not send — check connection and retry.');
    }
    btn.disabled = false;
    btn.textContent = 'Send';
  }

  function init() {
    var fab = document.getElementById('contact-fab');
    var panel = document.getElementById('contact-panel');
    if (!fab || !panel || fab.dataset.wired) return;
    fab.dataset.wired = '1';
    injectCss();
    fab.addEventListener('click', function () {
      if (panel.classList.contains('hidden')) openPanel();
      else closePanel();
    });
    document.getElementById('contact-close').addEventListener('click', closePanel);
    document.getElementById('contact-done-close').addEventListener('click', function () {
      show(document.getElementById('contact-done-view'), false);
      show(document.getElementById('contact-form-view'), true);
      closePanel();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !panel.classList.contains('hidden')) closePanel();
    });
    document.getElementById('contact-msg').addEventListener('input', updateCount);
    document.getElementById('contact-form').addEventListener('submit', send);
    updateCount();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.MinimsaahContact = { init: init };
})(window);
