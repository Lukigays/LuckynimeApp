-- ==============================================================================
-- MIGRATION (di-sanitize oleh Luckynime rebrand): admin_accounts
-- Tabel admin dashboard. CATATAN KEAMANAN:
--  * password_hash menyimpan password PLAINTEXT (dibandingkan dengan === di client).
--    HANYA untuk akun lokal/offline fallback — bukan untuk produksi.
--  * RLS aktif TANPA policy publik → anon/authenticated TIDAK bisa baca/tulis.
--    Akses hanya via service_role / Supabase Dashboard (bypass RLS).
--  * Tidak ada seed akun default. Buat admin pertama dengan:
--    INSERT INTO public.admin_accounts (id, username, email, password_hash, role)
--    VALUES ('admin-1', 'Owner', 'kamu@email.com', 'PASSWORD_KUAT_KAMU', 'super_admin');
--    (via Supabase SQL Editor)
--  * Rencana jangka panjang: pindahkan auth admin ke Supabase Auth + tabel admin_users.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.admin_accounts (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'finance_admin', 'moderator')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  notes TEXT,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_accounts_email ON public.admin_accounts(email);
CREATE INDEX IF NOT EXISTS idx_admin_accounts_role ON public.admin_accounts(role);
CREATE INDEX IF NOT EXISTS idx_admin_accounts_status ON public.admin_accounts(status);

ALTER TABLE public.admin_accounts ENABLE ROW LEVEL SECURITY;
-- Sengaja TIDAK ada policy publik (deny-by-default untuk anon & authenticated).
