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

  // The chat widget markup, byte-identical to what used to be pasted into
  // all 8 public pages (verified single variant before the move). Static
  // HTML only — zero user data interpolated, so innerHTML here is safe.
  // Pages keep just <script src="/assets/js/contact.js"></script>.
  var MARKUP = [
    '<button id="contact-fab" aria-label="Chat with MINIMSAAH" aria-haspopup="dialog" aria-expanded="false" class="fixed z-[10000] right-4 md:right-8 w-14 h-14 rounded-full bg-[#E63946] hover:bg-[#c53030] text-white flex items-center justify-center shadow-[0_8px_30px_rgba(230,57,70,0.45)] transition-colors touch-manipulation" style="bottom: max(5.5rem, env(safe-area-inset-bottom));">',
    '<svg class="w-6 h-6 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>',
    '</button>',
    '<div id="contact-panel" role="dialog" aria-modal="true" aria-label="Chat with MINIMSAAH" class="hidden fixed z-[10001] right-4 md:right-8 w-[calc(100vw-2rem)] max-w-[360px] bg-[#0A0A0A] border border-white/10 rounded-lg overflow-hidden shadow-2xl" style="bottom: max(10rem, calc(env(safe-area-inset-bottom) + 4.5rem));">',
    '<div class="flex items-center justify-between bg-[#E63946] px-4 py-3">',
    '<span class="font-[\'Space_Grotesk\',sans-serif] text-sm font-medium tracking-tight text-white">Chat with MINIMSAAH</span>',
    '<button id="contact-close" aria-label="Close chat" class="w-11 h-11 -mr-2 inline-flex items-center justify-center text-white/90 hover:text-white touch-manipulation">',
    '<svg class="w-5 h-5 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    '</button>',
    '</div>',
    '<div class="p-4">',
    '<div class="flex gap-2 mb-4">',
    '<div class="w-8 h-8 shrink-0 rounded-full bg-[#E63946]/15 border border-[#E63946]/30 flex items-center justify-center font-[\'Space_Grotesk\',sans-serif] text-xs text-[#E63946]">M</div>',
    '<p class="text-sm text-gray-300 bg-white/5 border border-white/5 rounded-lg rounded-tl-none px-3 py-2 leading-relaxed">Hi! Leave your name, email and message. I reply soon.</p>',
    '</div>',
    '<div id="contact-form-view">',
    '<form id="contact-form" class="space-y-3" novalidate>',
    '<div>',
    '<label for="contact-name" class="text-[11px] font-mono tracking-widest text-gray-400 uppercase">Name</label>',
    '<input id="contact-name" type="text" autocomplete="name" maxlength="200" placeholder="Your name" class="w-full mt-1 bg-white/5 border border-white/10 rounded-sm px-3 py-3 min-h-[44px] text-sm text-white placeholder:text-gray-600 focus:border-[#E63946]/50 focus:outline-none">',
    '</div>',
    '<div>',
    '<label for="contact-email" class="text-[11px] font-mono tracking-widest text-gray-400 uppercase">Email</label>',
    '<input id="contact-email" type="email" autocomplete="email" maxlength="320" placeholder="you@email.com" class="w-full mt-1 bg-white/5 border border-white/10 rounded-sm px-3 py-3 min-h-[44px] text-sm text-white placeholder:text-gray-600 focus:border-[#E63946]/50 focus:outline-none">',
    '</div>',
    '<div>',
    '<label for="contact-msg" class="text-[11px] font-mono tracking-widest text-gray-400 uppercase">Message</label>',
    '<textarea id="contact-msg" rows="3" maxlength="2000" placeholder="Type your message…" class="w-full mt-1 bg-white/5 border border-white/10 rounded-sm px-3 py-3 min-h-[88px] text-sm text-white placeholder:text-gray-600 focus:border-[#E63946]/50 focus:outline-none resize-y"></textarea>',
    '<p id="contact-count" class="text-[10px] font-mono text-gray-600 mt-1 text-right">0/2000</p>',
    '</div>',
    '<p id="contact-err" class="hidden text-xs text-[#E63946] bg-[#E63946]/10 border border-[#E63946]/20 rounded-sm px-3 py-2" role="alert"></p>',
    '<button id="contact-send" type="submit" class="w-full bg-[#E63946] hover:bg-[#c53030] text-white text-xs font-mono tracking-widest uppercase py-3 min-h-[44px] rounded-sm transition-colors touch-manipulation">Send</button>',
    '</form>',
    '</div>',
    '<div id="contact-done-view" class="hidden text-center py-6">',
    '<div class="w-14 h-14 mx-auto rounded-full bg-[#E63946]/15 border border-[#E63946]/30 flex items-center justify-center mb-3">',
    '<svg class="w-6 h-6 text-[#E63946]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>',
    '</div>',
    '<p class="text-sm text-white font-medium">Message sent.</p>',
    '<p class="text-xs text-gray-400 mt-1 mb-4">I reply soon.</p>',
    '<button id="contact-done-close" class="text-xs font-mono tracking-widest uppercase border border-white/10 px-5 py-3 min-h-[44px] rounded-sm hover:bg-white/5 touch-manipulation">Close</button>',
    '</div>',
    '</div>',
    '</div>'
  ].join('');

  // Build the widget if the page does not already carry it (all pages had
  // it pasted; new pages get it free from this script alone).
  function mount() {
    try {
      if (document.getElementById('contact-fab')) return;
      if (document.body && typeof document.body.insertAdjacentHTML === 'function') {
        document.body.insertAdjacentHTML('beforeend', MARKUP);
        return;
      }
      var wrap = document.createElement('div');
      wrap.innerHTML = MARKUP;
      while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
    } catch (e) {}
  }

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
    mount();
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
