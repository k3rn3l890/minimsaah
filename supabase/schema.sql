-- MINIMSAAH — Supabase schema (run BEFORE rls.sql + storage.sql)
-- Paste in Supabase Dashboard → SQL Editor → Run.
-- Creates public tables matching backend/prisma 20260919120856_init, Supabase-safe.
-- Idempotent: safe to run twice. password_hash nullable for Supabase Auth users.

-- ─── Enums (create if missing) ───
DO $$ BEGIN CREATE TYPE "Role" AS ENUM ('OWNER','EDITOR','JOURNALIST','VIDEOGRAPHER','SUBSCRIBER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "UserStatus" AS ENUM ('ACTIVE','INACTIVE','SUSPENDED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ContentStatus" AS ENUM ('DRAFT','REVIEW','PUBLISHED','ARCHIVED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ArticleCategory" AS ENUM ('FEATURE','MATCH_REPORT','ANALYSIS','INTERVIEW','OPINION','BREAKING'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "VideoCategory" AS ENUM ('HIGHLIGHT','INTERVIEW','DOCUMENTARY','BEHIND_SCENES','TUTORIAL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "MediaType" AS ENUM ('IMAGE','VIDEO','DOCUMENT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Tables ───
CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  avatar_url TEXT,
  bio TEXT,
  role "Role" NOT NULL DEFAULT 'SUBSCRIBER',
  status "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  refresh_token TEXT UNIQUE NOT NULL,
  user_agent TEXT,
  ip_address TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.articles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  excerpt TEXT,
  body TEXT NOT NULL,
  cover_image TEXT,
  category "ArticleCategory" NOT NULL DEFAULT 'FEATURE',
  tags TEXT[] DEFAULT '{}',
  author_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reading_time INTEGER NOT NULL DEFAULT 5,
  view_count INTEGER NOT NULL DEFAULT 0,
  featured BOOLEAN NOT NULL DEFAULT false,
  status "ContentStatus" NOT NULL DEFAULT 'DRAFT',
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.videos (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  video_url TEXT NOT NULL,
  embed_url TEXT,
  thumbnail TEXT,
  duration INTEGER,
  category "VideoCategory" NOT NULL DEFAULT 'HIGHLIGHT',
  tags TEXT[] DEFAULT '{}',
  author_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  view_count INTEGER NOT NULL DEFAULT 0,
  featured BOOLEAN NOT NULL DEFAULT false,
  status "ContentStatus" NOT NULL DEFAULT 'DRAFT',
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.documentaries (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  cover_image TEXT,
  video_url TEXT,
  embed_url TEXT,
  duration INTEGER,
  chapters JSONB,
  tags TEXT[] DEFAULT '{}',
  author_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  view_count INTEGER NOT NULL DEFAULT 0,
  featured BOOLEAN NOT NULL DEFAULT false,
  status "ContentStatus" NOT NULL DEFAULT 'DRAFT',
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  cover_image TEXT,
  date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  location TEXT,
  venue TEXT,
  ticket_url TEXT,
  tags TEXT[] DEFAULT '{}',
  author_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status "ContentStatus" NOT NULL DEFAULT 'DRAFT',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.tickers (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  link TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.media (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  url TEXT NOT NULL,
  alt TEXT,
  caption TEXT,
  type "MediaType" NOT NULL DEFAULT 'IMAGE',
  width INTEGER,
  height INTEGER,
  uploader_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Indexes ───
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON public.sessions(user_id);
CREATE INDEX IF NOT EXISTS articles_author_id_idx ON public.articles(author_id);
CREATE INDEX IF NOT EXISTS articles_status_published_at_idx ON public.articles(status, published_at);
CREATE INDEX IF NOT EXISTS articles_category_idx ON public.articles(category);
CREATE INDEX IF NOT EXISTS videos_author_id_idx ON public.videos(author_id);
CREATE INDEX IF NOT EXISTS videos_status_published_at_idx ON public.videos(status, published_at);
CREATE INDEX IF NOT EXISTS videos_category_idx ON public.videos(category);
CREATE INDEX IF NOT EXISTS documentaries_author_id_idx ON public.documentaries(author_id);
CREATE INDEX IF NOT EXISTS documentaries_status_published_at_idx ON public.documentaries(status, published_at);
CREATE INDEX IF NOT EXISTS events_author_id_idx ON public.events(author_id);
CREATE INDEX IF NOT EXISTS events_status_date_idx ON public.events(status, date);
CREATE INDEX IF NOT EXISTS tickers_active_priority_idx ON public.tickers(active, priority);
CREATE INDEX IF NOT EXISTS media_uploader_id_idx ON public.media(uploader_id);
CREATE INDEX IF NOT EXISTS media_type_idx ON public.media(type);
