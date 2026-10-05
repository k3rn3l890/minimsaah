/**
 * MINIMSAAH — supabase-client.js
 * Direct Supabase client for Pages + Supabase beta (no middleman server).
 * Uses anon key only. Service_role never exposed — deletes/role changes go via Pages Functions.
 * Falls back to Nest API when SUPABASE_URL not configured (localhost dev).
 */
(function (global) {
  function getConfig() {
    var url = global.__SUPABASE_URL || '';
    var anon = global.__SUPABASE_ANON_KEY || '';
    return { url: url, anon: anon, enabled: !!(url && anon && global.supabase) };
  }

  function client() {
    var cfg = getConfig();
    if (!cfg.enabled) return null;
    if (!global.__supabaseClient) {
      global.__supabaseClient = global.supabase.createClient(cfg.url, cfg.anon, {
        auth: { persistSession: true, autoRefreshToken: true },
      });
    }
    return global.__supabaseClient;
  }

  function isEnabled() {
    return getConfig().enabled;
  }

  // Throttled database call: at most once per windowMs per key.
  // Used for view counts — 1 count per video per 5 minutes per browser.
  // Returns the result, or null when skipped. Never throws.
  function throttledRpc(fnName, args, key, windowMs) {
    try {
      var k = 'ms_rpc_' + key;
      var last = 0;
      try { last = parseInt(localStorage.getItem(k) || '0', 10) || 0; } catch (e) { last = 0; }
      if (Date.now() - last < (windowMs || 5 * 60 * 1000)) return Promise.resolve(null);
      try { localStorage.setItem(k, String(Date.now())); } catch (e) {}
      var sb = client();
      if (!sb) return Promise.resolve(null);
      return sb.rpc(fnName, args).catch(function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }

  global.SupabaseDB = {
    client: client,
    isEnabled: isEnabled,
    getConfig: getConfig,
    throttledRpc: throttledRpc,
  };
})(window);
