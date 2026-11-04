-- MINIMSAAH — About Me section (boss-editable copy on the home page)
-- Run in Supabase Dashboard → SQL Editor AFTER supabase/site_settings.sql
-- (reuses the site_settings table; no new tables, no new policies —
-- public reads all, only OWNER/EDITOR can write, per its RLS).

-- Starter values = the copy currently hardcoded in index.html (#about).
-- Clear a field in Admin → Settings → About Me to restore these defaults.
-- Leave about_image_url unset to keep the built-in portrait
-- (/assets/img/about-portrait.png). Upload via Admin → Settings → About Me
-- (or paste a https:// links to any image) to change it.

insert into public.site_settings (key, value) values
  ('about_heading', 'MINIMSAAH'),
  ('about_para1', 'Sports journalist and documentary filmmaker based in Accra, Ghana. I cover grassroots football across West Africa — the stories, the players, the communities that make the beautiful game beautiful.'),
  ('about_para2', 'With over a decade of experience reporting from local pitches to international tournaments, my work has been featured in leading sports publications and broadcast networks. I believe every player has a story worth telling — and every story deserves to be told with integrity.'),
  ('about_stat_1_value', '10+'),
  ('about_stat_1_label', 'Years Reporting'),
  ('about_stat_2_value', '50+'),
  ('about_stat_2_label', 'Documentaries'),
  ('about_stat_3_value', '12'),
  ('about_stat_3_label', 'Countries Covered'),
  ('about_stat_4_value', '3'),
  ('about_stat_4_label', 'Awards Won'),
  ('about_tags', 'Grassroots Football, Player Profiles, Match Analysis, Documentary Film')
on conflict (key) do nothing;
