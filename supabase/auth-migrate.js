/**
 * MINIMSAAH — auth-migrate.js (run locally with service_role, never in browser)
 * Migrates 4 staff users to Supabase Auth preserving admin123 passwords for beta. No 5th user.
 * Usage: SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<service_role> node supabase/auth-migrate.js
 */
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

const users = [
  { email: 'admin@minimsaah.com', password: 'admin123', role: 'OWNER', firstName: 'Kwame', lastName: 'Asante' },
  { email: 'editor@minimsaah.com', password: 'admin123', role: 'EDITOR', firstName: 'Ama', lastName: 'Mensah' },
  { email: 'writer@minimsaah.com', password: 'writer123', role: 'JOURNALIST', firstName: 'Kofi', lastName: 'Boateng' },
  { email: 'video@minimsaah.com', password: 'writer123', role: 'VIDEOGRAPHER', firstName: 'Yaa', lastName: 'Owusu' },
];

(async () => {
  for (const u of users) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: { role: u.role, firstName: u.firstName, lastName: u.lastName },
    });
    if (error) {
      console.error('FAIL', u.email, error.message);
      continue;
    }
    console.log('OK', u.email, data.user.id, u.role);
    // Link profile: public.users.id = auth.users.id (snake_case columns match supabase/schema.sql)
    const { error: pErr } = await supabase.from('users').upsert({
      id: data.user.id,
      email: u.email,
      first_name: u.firstName,
      last_name: u.lastName,
      role: u.role,
      status: 'ACTIVE',
    }, { onConflict: 'id' });
    if (pErr) console.error('profile FAIL', u.email, pErr.message);
    else console.log('profile OK', u.email);
  }
})();
