-- 1. Table des profils utilisateurs (liée à l'authentification Supabase)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT,
    name TEXT,
    photo_url TEXT,
    credits INTEGER DEFAULT 100,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 2. Table pour les médias importés (images et vidéos uploadées par l'utilisateur)
CREATE TABLE IF NOT EXISTS public.imported_assets (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    file_url TEXT NOT NULL,
    file_type TEXT CHECK (file_type IN ('image', 'video')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 3. Table pour les générations (images et vidéos créées par l'IA)
CREATE TABLE IF NOT EXISTS public.generations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    type TEXT CHECK (type IN ('image', 'video')),
    prompt TEXT,
    reference_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 4. Table pour l'historique des transactions (débit/ajout de crédits)
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- ==========================================
-- SÉCURITÉ : ROW LEVEL SECURITY (RLS)
-- ==========================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imported_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- Politiques pour les Profils (Users)
DROP POLICY IF EXISTS "Voir son propre profil" ON public.users;
CREATE POLICY "Voir son propre profil" ON public.users FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Modifier son propre profil" ON public.users;
CREATE POLICY "Modifier son propre profil" ON public.users FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Créer son profil" ON public.users;
CREATE POLICY "Créer son profil" ON public.users FOR INSERT WITH CHECK (auth.uid() = id);

-- Politiques pour les Imports (Imported Assets)
DROP POLICY IF EXISTS "Voir ses propres imports" ON public.imported_assets;
CREATE POLICY "Voir ses propres imports" ON public.imported_assets FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Ajouter ses propres imports" ON public.imported_assets;
CREATE POLICY "Ajouter ses propres imports" ON public.imported_assets FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Supprimer ses propres imports" ON public.imported_assets;
CREATE POLICY "Supprimer ses propres imports" ON public.imported_assets FOR DELETE USING (auth.uid() = user_id);

-- Politiques pour les Générations
DROP POLICY IF EXISTS "Voir ses propres générations" ON public.generations;
CREATE POLICY "Voir ses propres générations" ON public.generations FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Ajouter ses propres générations" ON public.generations;
CREATE POLICY "Ajouter ses propres générations" ON public.generations FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Supprimer ses propres générations" ON public.generations;
CREATE POLICY "Supprimer ses propres générations" ON public.generations FOR DELETE USING (auth.uid() = user_id);

-- Politiques pour les Transactions
DROP POLICY IF EXISTS "Voir ses propres transactions" ON public.transactions;
CREATE POLICY "Voir ses propres transactions" ON public.transactions FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Ajouter ses propres transactions" ON public.transactions;
CREATE POLICY "Ajouter ses propres transactions" ON public.transactions FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Enable realtime for all tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.generations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.imported_assets;

-- ==========================================
-- STOCKAGE : BUCKET POUR LES FICHIERS
-- ==========================================
INSERT INTO storage.buckets (id, name, public) 
VALUES ('uploads', 'uploads', true) 
ON CONFLICT DO NOTHING;

CREATE POLICY "Lecture publique des fichiers" ON storage.objects FOR SELECT USING (bucket_id = 'uploads');
CREATE POLICY "Upload pour utilisateurs connectés" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'uploads' AND auth.role() = 'authenticated');
