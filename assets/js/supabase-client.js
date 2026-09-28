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

  global.SupabaseDB = {
    client: client,
    isEnabled: isEnabled,
    getConfig: getConfig,
  };
})(window);
