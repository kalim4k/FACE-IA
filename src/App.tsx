import React, { useState, useRef, useEffect } from 'react';
import { Home, Library, Menu as MenuIcon, Video, Image as ImageIcon, Info, User, X, Sparkles, Zap, CreditCard, Loader2, Download, UploadCloud, FileVideo, FileImage, LogIn, Plus, Mail, Lock } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { supabase } from './supabase';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { InstallPWA } from './components/InstallPWA';

const KIE_API_KEY = "ffc67aa92b32521540881121dab456dd";

const uploadFileToPublicUrl = async (file: File, userId?: string, fileType?: 'image' | 'video'): Promise<string> => {
  const fileExt = file.name.split('.').pop();
  const fileName = userId ? `${userId}/${Math.random()}.${fileExt}` : `${Math.random()}.${fileExt}`;

  try {
    const { error: uploadError } = await supabase.storage
      .from('uploads')
      .upload(fileName, file);

    if (uploadError) {
      throw uploadError;
    }

    const { data } = supabase.storage
      .from('uploads')
      .getPublicUrl(fileName);

    const publicUrl = data.publicUrl;

    if (userId && fileType) {
      await supabase.from('imported_assets').insert([{
        user_id: userId,
        file_url: publicUrl,
        file_type: fileType,
        created_at: new Date().toISOString()
      }]);
    }

    return publicUrl;
  } catch (error) {
    console.error('Error uploading file:', error);
    throw new Error(`Could not upload file to public URL for processing.`);
  }
};

const uploadUrlToSupabase = async (url: string, type: 'image' | 'video', userId: string): Promise<string> => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const fileExt = type === 'video' ? 'mp4' : 'jpg';
    const fileName = `${userId}/generated_${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('uploads')
      .upload(fileName, blob);

    if (uploadError) throw uploadError;

    const { data } = supabase.storage
      .from('uploads')
      .getPublicUrl(fileName);

    return data.publicUrl;
  } catch (error) {
    console.error('Error uploading generated file to Supabase:', error);
    return url; // Fallback to original URL if upload fails
  }
};

type View = 'home' | 'library' | 'video' | 'image' | 'credits' | 'profile';

export interface Transaction {
  id: string;
  amount: number;
  type: string;
  description: string;
  createdAt: string;
}

export interface Generation {
  id: string;
  url: string;
  type: 'image' | 'video';
  prompt: string;
  createdAt: string;
  referenceUrl?: string;
}

export default function App() {
  const [currentView, setCurrentView] = useState<View>('home');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [credits, setCredits] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [generations, setGenerations] = useState<Generation[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        checkAndCreateUser(session.user);
      }
      setIsAuthReady(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        checkAndCreateUser(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkAndCreateUser = async (currentUser: SupabaseUser) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', currentUser.id)
        .single();

      if (error && error.code === 'PGRST116') {
        // User doesn't exist, create them
        await supabase.from('users').insert([{
          id: currentUser.id,
          credits: 100,
          email: currentUser.email,
          name: currentUser.user_metadata?.full_name || 'Utilisateur',
          photo_url: currentUser.user_metadata?.avatar_url || '',
          created_at: new Date().toISOString()
        }]);
      }
    } catch (error) {
      console.error('Error checking user:', error);
    }
  };

  useEffect(() => {
    if (!user || !isAuthReady) return;

    // Fetch initial data
    const fetchData = async () => {
      // Credits
      const { data: userData } = await supabase
        .from('users')
        .select('credits')
        .eq('id', user.id)
        .single();
      if (userData) setCredits(userData.credits || 0);

      // Transactions
      const { data: transData } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (transData) {
        setTransactions(transData.map(t => ({
          id: t.id,
          amount: t.amount,
          type: t.type,
          description: t.description,
          createdAt: t.created_at
        })));
      }

      // Generations
      const { data: genData } = await supabase
        .from('generations')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (genData) {
        setGenerations(genData.map(g => ({
          id: g.id,
          url: g.url,
          type: g.type,
          prompt: g.prompt,
          createdAt: g.created_at,
          referenceUrl: g.reference_url
        })));
      }
    };

    fetchData();

    // Set up real-time subscriptions
    const userSub = supabase.channel('user-changes')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users', filter: `id=eq.${user.id}` }, payload => {
        setCredits(payload.new.credits || 0);
      }).subscribe();

    const transSub = supabase.channel('trans-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transactions', filter: `user_id=eq.${user.id}` }, payload => {
        setTransactions(prev => [{
          id: payload.new.id,
          amount: payload.new.amount,
          type: payload.new.type,
          description: payload.new.description,
          createdAt: payload.new.created_at
        }, ...prev].slice(0, 50));
      }).subscribe();

    const genSub = supabase.channel('gen-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'generations', filter: `user_id=eq.${user.id}` }, payload => {
        setGenerations(prev => [{
          id: payload.new.id,
          url: payload.new.url,
          type: payload.new.type,
          prompt: payload.new.prompt,
          createdAt: payload.new.created_at,
          referenceUrl: payload.new.reference_url
        }, ...prev].slice(0, 50));
      }).subscribe();

    return () => {
      supabase.removeChannel(userSub);
      supabase.removeChannel(transSub);
      supabase.removeChannel(genSub);
    };
  }, [user, isAuthReady]);

  const handleDeductCredits = async (amount: number, type: string, description: string) => {
    if (!user) return false;
    if (credits < amount) {
      alert("Crédits insuffisants.");
      return false;
    }
    try {
      const newCredits = credits - amount;
      
      const { error: userError } = await supabase
        .from('users')
        .update({ credits: newCredits })
        .eq('id', user.id);
        
      if (userError) throw userError;
      
      const { error: transError } = await supabase
        .from('transactions')
        .insert([{
          user_id: user.id,
          amount: -amount,
          type,
          description,
          created_at: new Date().toISOString()
        }]);
        
      if (transError) throw transError;
      
      return true;
    } catch (error) {
      console.error('Error deducting credits:', error);
      return false;
    }
  };

  const handleRefundCredits = async (amount: number, type: string, description: string) => {
    if (!user) return false;
    try {
      const newCredits = credits + amount;
      
      const { error: userError } = await supabase
        .from('users')
        .update({ credits: newCredits })
        .eq('id', user.id);
        
      if (userError) throw userError;
      
      const { error: transError } = await supabase
        .from('transactions')
        .insert([{
          user_id: user.id,
          amount: amount, // Positive amount for refund
          type,
          description,
          created_at: new Date().toISOString()
        }]);
        
      if (transError) throw transError;
      
      return true;
    } catch (error) {
      console.error('Error refunding credits:', error);
      return false;
    }
  };

  const handleSaveGeneration = async (url: string, type: 'image' | 'video', prompt: string, referenceUrl?: string) => {
    if (!user) return;
    try {
      await supabase.from('generations').insert([{
        user_id: user.id,
        url,
        type,
        prompt,
        reference_url: referenceUrl || null,
        created_at: new Date().toISOString()
      }]);
    } catch (error) {
      console.error('Error saving generation:', error);
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  const handleNavigate = (view: View) => {
    setCurrentView(view);
    setIsSidebarOpen(false);
  };

  if (!isAuthReady) {
    return (
      <div className="flex items-center justify-center h-screen bg-neutral-50">
        <Loader2 className="animate-spin text-blue-500" size={48} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-white text-neutral-900 font-sans selection:bg-blue-100 selection:text-blue-900 flex flex-col">
        {/* Navigation */}
        <nav className="flex items-center justify-between px-6 py-4 md:px-12 md:py-6 max-w-7xl mx-auto w-full">
          <div className="flex items-center gap-2.5">
            <div className="bg-neutral-900 p-1.5 rounded-xl text-white shadow-sm">
              <Sparkles size={20} className="text-blue-400" />
            </div>
            <span className="text-xl font-black tracking-tighter">FACE IA</span>
          </div>
          <button
            onClick={() => setShowAuthModal(true)}
            className="text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors"
          >
            Se connecter
          </button>
        </nav>

        {/* Hero Section */}
        <main className="flex-1 flex flex-col items-center justify-center px-6 text-center max-w-4xl mx-auto w-full mt-12 md:mt-24 mb-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-neutral-100 border border-neutral-200 text-sm font-medium text-neutral-600 mb-8"
          >
            <Sparkles size={14} className="text-blue-500" />
            <span>La nouvelle ère de la création</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="text-5xl md:text-7xl font-bold tracking-tighter leading-[1.1] mb-6 text-neutral-900"
          >
            Donnez vie à vos idées avec <br className="hidden md:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">
              l'intelligence artificielle
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="text-lg md:text-xl text-neutral-500 mb-10 max-w-2xl leading-relaxed"
          >
            Générez des vidéos dynamiques et des images époustouflantes en quelques secondes. 
            Une plateforme simple, puissante et conçue pour les créateurs.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto"
          >
            <button
              onClick={() => setShowAuthModal(true)}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-neutral-900 text-white px-8 py-4 rounded-full font-medium hover:bg-neutral-800 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
            >
              <LogIn size={18} />
              Commencer gratuitement
            </button>
          </motion.div>
        </main>

        {/* Features & Video Section */}
        <section className="bg-neutral-50 py-24 border-t border-neutral-200 overflow-hidden relative">
          {/* Decorative background elements */}
          <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
            <div className="absolute -top-[20%] -right-[10%] w-[50%] h-[50%] rounded-full bg-blue-100/50 blur-3xl" />
            <div className="absolute -bottom-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-purple-100/50 blur-3xl" />
          </div>

          <div className="max-w-7xl mx-auto px-6 md:px-12 relative z-10">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">Découvrez la puissance de FACE IA</h2>
              <p className="text-neutral-500 text-lg max-w-2xl mx-auto">Des outils d'intelligence artificielle de pointe pour donner vie à votre imagination.</p>
            </div>

            <div className="grid lg:grid-cols-2 gap-12 items-center">
              {/* Features List */}
              <div className="space-y-6 order-2 lg:order-1">
                <motion.div 
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5 }}
                  className="bg-white p-8 rounded-3xl shadow-sm border border-neutral-100 hover:shadow-md transition-shadow"
                >
                  <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-6">
                    <Video size={28} />
                  </div>
                  <h3 className="text-2xl font-bold tracking-tight mb-3">Video Motion Control</h3>
                  <p className="text-neutral-500 leading-relaxed">
                    Transformez des images statiques en vidéos dynamiques. Contrôlez le mouvement avec précision grâce au modèle Kling de pointe. Importez simplement votre image de référence et une vidéo de mouvement.
                  </p>
                </motion.div>

                <motion.div 
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                  className="bg-white p-8 rounded-3xl shadow-sm border border-neutral-100 hover:shadow-md transition-shadow"
                >
                  <div className="w-14 h-14 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center mb-6">
                    <ImageIcon size={28} />
                  </div>
                  <h3 className="text-2xl font-bold tracking-tight mb-3">Image Nano Banana</h3>
                  <p className="text-neutral-500 leading-relaxed">
                    Créez des images d'une qualité exceptionnelle à partir de simples descriptions textuelles. Laissez libre cours à votre imagination avec le modèle Nano Banana 2.
                  </p>
                </motion.div>
              </div>

              {/* Video Presentation */}
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
                className="relative aspect-video bg-neutral-900 rounded-[2rem] overflow-hidden shadow-2xl border border-neutral-800 flex items-center justify-center order-1 lg:order-2"
              >
                <video
                  src="https://ysbiedwkakdqadxtuwab.supabase.co/storage/v1/object/public/uploads/5ff9b7bc-9acd-4a54-b43a-117467a69df7.mp4"
                  autoPlay
                  loop
                  muted
                  playsInline
                  controls
                  className="w-full h-full object-cover"
                />
              </motion.div>
            </div>
          </div>
        </section>
        
        {/* Footer */}
        <footer className="py-8 text-center text-sm text-neutral-400 border-t border-neutral-200">
          <p>© {new Date().getFullYear()} FACE IA. Tous droits réservés.</p>
        </footer>

        {/* Auth Modal */}
        <AnimatePresence>
          {showAuthModal && (
            <AuthModal onClose={() => setShowAuthModal(false)} />
          )}
        </AnimatePresence>
      </div>
    );
  }

  const renderView = () => {
    switch (currentView) {
      case 'home':
        return <HomeView onNavigate={handleNavigate} user={user} />;
      case 'library':
        return <LibraryView generations={generations} />;
      case 'video':
        return <VideoGenerationView onDeductCredits={handleDeductCredits} onRefundCredits={handleRefundCredits} onSaveGeneration={handleSaveGeneration} user={user} />;
      case 'image':
        return <ImageGenerationView onDeductCredits={handleDeductCredits} onRefundCredits={handleRefundCredits} onSaveGeneration={handleSaveGeneration} user={user} />;
      case 'credits':
        return <CreditsView credits={credits} transactions={transactions} user={user} />;
      case 'profile':
        return <ProfileView user={user} />;
      default:
        return <HomeView onNavigate={handleNavigate} user={user} />;
    }
  };

  return (
    <div className="flex flex-col min-h-[100dvh] bg-neutral-50 text-neutral-900 font-sans">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 bg-white border-b border-neutral-200">
        <div className="flex items-center gap-2.5">
          <div className="bg-neutral-900 p-1.5 rounded-xl text-white shadow-sm">
            <Sparkles size={22} className="text-blue-400" />
          </div>
          <h1 className="text-2xl font-black tracking-tighter bg-gradient-to-br from-neutral-900 to-neutral-600 bg-clip-text text-transparent">
            FACE IA
          </h1>
        </div>
        <button 
          onClick={() => handleNavigate('credits')}
          className="flex items-center gap-2 bg-gradient-to-r from-amber-100 to-yellow-100 hover:from-amber-200 hover:to-yellow-200 border border-amber-200/50 transition-all px-4 py-1.5 rounded-full cursor-pointer shadow-sm"
        >
          <Zap size={16} className="text-amber-600 fill-amber-600" />
          <span className="text-sm font-bold text-amber-900">{credits.toLocaleString()}</span>
          <div className="bg-amber-500 text-white rounded-full p-0.5 ml-1">
            <Plus size={12} strokeWidth={3} />
          </div>
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative pt-20 pb-20">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentView}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="h-full"
          >
            {renderView()}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-neutral-200 px-6 py-3 pb-safe">
        <div className="flex justify-around items-center max-w-md mx-auto">
          <NavItem
            icon={<Home size={24} />}
            label="Accueil"
            isActive={currentView === 'home'}
            onClick={() => handleNavigate('home')}
          />
          <NavItem
            icon={<Library size={24} />}
            label="Bibliothèque"
            isActive={currentView === 'library'}
            onClick={() => handleNavigate('library')}
          />
          <NavItem
            icon={<MenuIcon size={24} />}
            label="Menu"
            isActive={isSidebarOpen}
            onClick={() => setIsSidebarOpen(true)}
          />
        </div>
      </nav>

      {/* Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-black z-40"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
              className="fixed inset-y-0 left-0 w-72 bg-white shadow-2xl z-50 flex flex-col"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
                <h2 className="text-lg font-semibold">Menu</h2>
                <button
                  onClick={() => setIsSidebarOpen(false)}
                  className="p-2 -mr-2 text-neutral-500 hover:text-neutral-900 rounded-full hover:bg-neutral-100 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto py-4">
                <SidebarItem
                  icon={<Video size={20} />}
                  label="Video motion control"
                  isActive={currentView === 'video'}
                  onClick={() => handleNavigate('video')}
                />
                <SidebarItem
                  icon={<ImageIcon size={20} />}
                  label="Génération Image (Gemini)"
                  isActive={currentView === 'image'}
                  onClick={() => handleNavigate('image')}
                />
                <SidebarItem
                  icon={<Info size={20} />}
                  label="Crédits"
                  isActive={currentView === 'credits'}
                  onClick={() => handleNavigate('credits')}
                />
                <SidebarItem
                  icon={<User size={20} />}
                  label="Profil"
                  isActive={currentView === 'profile'}
                  onClick={() => handleNavigate('profile')}
                />
                <SidebarItem
                  icon={<Library size={20} />}
                  label="Bibliothèque"
                  isActive={currentView === 'library'}
                  onClick={() => handleNavigate('library')}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <InstallPWA />
    </div>
  );
}

// --- Components ---

function NavItem({ icon, label, isActive, onClick }: { icon: React.ReactNode; label: string; isActive: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-1 p-2 min-w-[72px] transition-colors ${
        isActive ? 'text-blue-600' : 'text-neutral-500 hover:text-neutral-900'
      }`}
    >
      {icon}
      <span className="text-[10px] font-medium uppercase tracking-wider">{label}</span>
    </button>
  );
}

function AuthModal({ onClose }: { onClose: () => void }) {
  const [isLogin, setIsLogin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: name,
            }
          }
        });
        if (error) throw error;
        // Auto sign-in after signup since email confirmation is disabled
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="p-8">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-2xl font-bold tracking-tight">
              {isLogin ? 'Bon retour' : 'Créer un compte'}
            </h2>
            <button onClick={onClose} className="p-2 text-neutral-400 hover:text-neutral-900 rounded-full hover:bg-neutral-100 transition-colors">
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1.5">Nom complet</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-400">
                    <User size={18} />
                  </div>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
                    placeholder="Jean Dupont"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">Email</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-400">
                  <Mail size={18} />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
                  placeholder="vous@exemple.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">Mot de passe</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-400">
                  <Lock size={18} />
                </div>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-neutral-900 text-white rounded-xl font-medium hover:bg-neutral-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-6"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : (isLogin ? 'Se connecter' : 'S\'inscrire')}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-neutral-500">
            {isLogin ? "Vous n'avez pas de compte ?" : "Vous avez déjà un compte ?"}
            <button
              onClick={() => { setIsLogin(!isLogin); setError(null); }}
              className="ml-1.5 text-blue-600 font-medium hover:underline"
            >
              {isLogin ? "S'inscrire" : "Se connecter"}
            </button>
          </p>
        </div>
      </motion.div>
    </div>
  );
}

function SidebarItem({ icon, label, isActive, onClick }: { icon: React.ReactNode; label: string; isActive: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-4 px-6 py-4 transition-colors ${
        isActive ? 'bg-blue-50 text-blue-600 font-medium' : 'text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

// --- Views ---

function HomeView({ onNavigate, user }: { onNavigate: (view: View) => void, user: SupabaseUser }) {
  return (
    <div className="p-6 h-full flex flex-col">
      <div className="mb-8">
        <h2 className="text-3xl font-light tracking-tight mb-2">Bonjour, {user.user_metadata?.full_name?.split(' ')[0] || 'Utilisateur'}</h2>
        <p className="text-neutral-500">Que souhaitez-vous créer aujourd'hui ?</p>
      </div>

      <div className="grid gap-4">
        <button
          onClick={() => onNavigate('video')}
          className="flex flex-col items-start p-6 bg-white rounded-2xl border border-neutral-200 shadow-sm hover:shadow-md transition-shadow text-left group"
        >
          <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Video size={24} />
          </div>
          <h3 className="text-lg font-medium mb-1">Video motion control</h3>
          <p className="text-sm text-neutral-500">Générez des vidéos dynamiques avec Kling.</p>
        </button>

        <button
          onClick={() => onNavigate('image')}
          className="flex flex-col items-start p-6 bg-white rounded-2xl border border-neutral-200 shadow-sm hover:shadow-md transition-shadow text-left group"
        >
          <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <ImageIcon size={24} />
          </div>
          <h3 className="text-lg font-medium mb-1">Génération Image (Nano Banana 2)</h3>
          <p className="text-sm text-neutral-500">Créez des images époustouflantes avec Nano Banana 2.</p>
        </button>
      </div>
    </div>
  );
}


function LibraryView({ generations }: { generations: Generation[] }) {
  return (
    <div className="p-6 h-full overflow-y-auto pb-24">
      <h2 className="text-2xl font-light tracking-tight mb-6">Bibliothèque</h2>
      
      {generations.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {generations.map((gen) => (
            <div key={gen.id} className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden flex flex-col">
              <div className="aspect-video bg-neutral-100 relative">
                {gen.type === 'video' ? (
                  <video src={gen.url} controls className="w-full h-full object-cover" />
                ) : (
                  <img src={gen.url} alt={gen.prompt} className="w-full h-full object-cover" />
                )}
                {gen.referenceUrl && (
                  <div className="absolute bottom-2 left-2 w-12 h-12 rounded-lg overflow-hidden border-2 border-white shadow-md">
                    <img src={gen.referenceUrl} alt="Reference" className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md text-white px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1">
                  {gen.type === 'video' ? <Video size={12} /> : <ImageIcon size={12} />}
                  {gen.type === 'video' ? 'Vidéo' : 'Image'}
                </div>
              </div>
              <div className="p-4 flex-1 flex flex-col">
                <p className="text-sm text-neutral-700 line-clamp-2 mb-2 flex-1" title={gen.prompt}>
                  {gen.prompt}
                </p>
                <div className="flex items-center justify-between mt-auto pt-2 border-t border-neutral-100">
                  <span className="text-xs text-neutral-400">
                    {new Date(gen.createdAt).toLocaleDateString()}
                  </span>
                  <a 
                    href={gen.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="p-1.5 text-neutral-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    <Download size={16} />
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-[50vh] text-neutral-400">
          <Library size={48} className="mb-4 opacity-20" />
          <p>Votre bibliothèque est vide.</p>
        </div>
      )}
    </div>
  );
}

function VideoGenerationView({ onDeductCredits, onRefundCredits, onSaveGeneration, user }: { onDeductCredits: (amount: number, type: string, description: string) => Promise<boolean>, onRefundCredits: (amount: number, type: string, description: string) => Promise<boolean>, onSaveGeneration: (url: string, type: 'image' | 'video', prompt: string, referenceUrl?: string) => Promise<void>, user: SupabaseUser }) {
  const [prompt, setPrompt] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [estimatedCost, setEstimatedCost] = useState<number>(100);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState('');
  const [generatedVideo, setGeneratedVideo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (videoFile) {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        window.URL.revokeObjectURL(video.src);
        const duration = video.duration;
        setVideoDuration(duration);
        // Example calculation: 10 credits per second, minimum 50
        setEstimatedCost(Math.max(50, Math.ceil(duration) * 10));
      };
      video.onerror = () => {
        window.URL.revokeObjectURL(video.src);
        setVideoDuration(null);
        setEstimatedCost(100);
      };
      video.src = URL.createObjectURL(videoFile);
    } else {
      setVideoDuration(null);
      setEstimatedCost(100);
    }
  }, [videoFile]);

  const handleGenerate = async () => {
    if (!imageFile || !videoFile) {
      setError("L'image de référence et la vidéo de référence sont requises.");
      return;
    }

    const cost = estimatedCost;
    const durationText = videoDuration ? ` (${Math.ceil(videoDuration)}s)` : '';
    const success = await onDeductCredits(cost, 'video_generation', `Génération vidéo Kling${durationText}`);
    if (!success) return;

    setIsGenerating(true);
    setError(null);
    setGeneratedVideo(null);

    try {
      setStatus('Upload des fichiers...');
      const imageUrl = await uploadFileToPublicUrl(imageFile, user.id, 'image');
      const videoUrl = await uploadFileToPublicUrl(videoFile, user.id, 'video');

      setStatus('Création de la tâche vidéo...');
      
      const createResponse = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${KIE_API_KEY}`
        },
        body: JSON.stringify({
          model: "kling-2.6/motion-control",
          input: {
            prompt: prompt || "The cartoon character is dancing.",
            input_urls: [imageUrl],
            video_urls: [videoUrl],
            character_orientation: "video",
            mode: "720p"
          }
        })
      });

      if (!createResponse.ok) {
        const errData = await createResponse.json();
        throw new Error(errData.msg || "Erreur lors de la création de la tâche");
      }

      const createData = await createResponse.json();
      const taskId = createData.data.taskId;

      setStatus('Génération en cours... (cela peut prendre plusieurs minutes)');

      let isDone = false;
      let finalVideoUrl = '';

      while (!isDone) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        const checkResponse = await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`, {
          headers: {
            'Authorization': `Bearer ${KIE_API_KEY}`
          }
        });
        
        if (!checkResponse.ok) {
          throw new Error("Erreur lors de la vérification du statut");
        }

        const checkData = await checkResponse.json();
        const state = checkData.data.state;

        if (state === 'success') {
          isDone = true;
          const resultJson = JSON.parse(checkData.data.resultJson);
          finalVideoUrl = resultJson.resultUrls[0];
        } else if (state === 'fail') {
          throw new Error(checkData.data.failMsg || "La génération a échoué");
        }
      }

      setStatus('Sauvegarde de la vidéo...');
      const savedVideoUrl = await uploadUrlToSupabase(finalVideoUrl, 'video', user.id);

      setGeneratedVideo(savedVideoUrl);
      await onSaveGeneration(savedVideoUrl, 'video', prompt || "Motion Control Video", imageUrl);
      setIsGenerating(false);
      setStatus('');
    } catch (err: any) {
      const errorMessage = err.message || "Une erreur est survenue";
      setError(errorMessage);
      setIsGenerating(false);
      setStatus('');
      await onRefundCredits(cost, 'refund', `Remboursement suite à une erreur : ${errorMessage}`);
    }
  };

  const handleDownload = async () => {
    if (!generatedVideo) return;
    try {
      const response = await fetch(generatedVideo);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `face-ia-video-${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Download failed', err);
      window.open(generatedVideo, '_blank');
    }
  };

  return (
    <div className="p-6 h-full overflow-y-auto pb-24">
      <h2 className="text-2xl font-light tracking-tight mb-2">Video motion control</h2>
      <p className="text-neutral-500 mb-6">Générez des vidéos dynamiques avec Kling 2.6 Motion Control</p>

      <div className="space-y-6 max-w-2xl mx-auto">
        <div className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm space-y-6">
          
          <FileUploadZone 
            file={imageFile} 
            setFile={setImageFile} 
            accept="image/*" 
            type="image" 
            label="Image de référence (Requise)"
          />

          <FileUploadZone 
            file={videoFile} 
            setFile={setVideoFile} 
            accept="video/*" 
            type="video" 
            label="Vidéo de référence (Requise)"
          />

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">Prompt (Optionnel)</label>
            <textarea 
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ex: The cartoon character is dancing."
              className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px] resize-none"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100">
              {error}
            </div>
          )}

          <button 
            onClick={handleGenerate}
            disabled={isGenerating || !imageFile || !videoFile}
            className="w-full py-4 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm"
          >
            {isGenerating ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                {status || 'Génération...'}
              </>
            ) : (
              <>
                <Sparkles size={18} />
                Générer la vidéo (-{estimatedCost} crédits)
              </>
            )}
          </button>
        </div>

        {generatedVideo && (
          <div className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm space-y-4">
            <h3 className="text-lg font-medium">Résultat</h3>
            <div className="rounded-xl overflow-hidden border border-neutral-200 bg-black aspect-video flex items-center justify-center relative group">
              <video src={generatedVideo} controls autoPlay loop className="w-full h-full object-contain" />
            </div>
            <button 
              onClick={handleDownload}
              className="w-full py-3 bg-neutral-900 text-white rounded-xl font-medium hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2"
            >
              <Download size={18} />
              Télécharger la vidéo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ImageGenerationView({ onDeductCredits, onRefundCredits, onSaveGeneration, user }: { onDeductCredits: (amount: number, type: string, description: string) => Promise<boolean>, onRefundCredits: (amount: number, type: string, description: string) => Promise<boolean>, onSaveGeneration: (url: string, type: 'image' | 'video', prompt: string, referenceUrl?: string) => Promise<void>, user: SupabaseUser }) {
  const [prompt, setPrompt] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState('');
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!prompt) {
      setError("Le prompt est requis.");
      return;
    }

    const cost = 25;
    const success = await onDeductCredits(cost, 'image_generation', 'Génération image Nano Banana');
    if (!success) return;

    setIsGenerating(true);
    setError(null);
    setGeneratedImage(null);

    try {
      let imageUrls: string[] = [];
      if (imageFile) {
        setStatus('Upload de l\'image de référence...');
        const uploadedUrl = await uploadFileToPublicUrl(imageFile, user.id, 'image');
        imageUrls.push(uploadedUrl);
      }

      setStatus('Création de la tâche image...');
      
      const payload: any = {
        model: "nano-banana-2",
        input: {
          prompt: prompt,
          aspect_ratio: "auto",
          resolution: "1K",
          output_format: "jpg"
        }
      };

      if (imageUrls.length > 0) {
        payload.input.image_input = imageUrls;
      }

      const createResponse = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${KIE_API_KEY}`
        },
        body: JSON.stringify(payload)
      });

      if (!createResponse.ok) {
        const errData = await createResponse.json();
        throw new Error(errData.msg || "Erreur lors de la création de la tâche");
      }

      const createData = await createResponse.json();
      const taskId = createData.data.taskId;

      setStatus('Génération en cours...');

      let isDone = false;
      let finalImageUrl = '';

      while (!isDone) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        const checkResponse = await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`, {
          headers: {
            'Authorization': `Bearer ${KIE_API_KEY}`
          }
        });
        
        if (!checkResponse.ok) {
          throw new Error("Erreur lors de la vérification du statut");
        }

        const checkData = await checkResponse.json();
        const state = checkData.data.state;

        if (state === 'success') {
          isDone = true;
          const resultJson = JSON.parse(checkData.data.resultJson);
          finalImageUrl = resultJson.resultUrls[0];
        } else if (state === 'fail') {
          throw new Error(checkData.data.failMsg || "La génération a échoué");
        }
      }

      setStatus('Sauvegarde de l\'image...');
      const savedImageUrl = await uploadUrlToSupabase(finalImageUrl, 'image', user.id);

      setGeneratedImage(savedImageUrl);
      await onSaveGeneration(savedImageUrl, 'image', prompt, imageUrls[0]);
      setIsGenerating(false);
      setStatus('');
    } catch (err: any) {
      const errorMessage = err.message || "Une erreur est survenue";
      setError(errorMessage);
      setIsGenerating(false);
      setStatus('');
      await onRefundCredits(cost, 'refund', `Remboursement suite à une erreur : ${errorMessage}`);
    }
  };

  const handleDownload = async () => {
    if (!generatedImage) return;
    try {
      const response = await fetch(generatedImage);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `face-ia-image-${Date.now()}.jpg`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Download failed', err);
      window.open(generatedImage, '_blank');
    }
  };

  return (
    <div className="p-6 h-full overflow-y-auto pb-24">
      <h2 className="text-2xl font-light tracking-tight mb-2">Génération d'Image</h2>
      <p className="text-neutral-500 mb-6">Propulsé par Nano Banana 2</p>
      
      <div className="space-y-6 max-w-2xl mx-auto">
        <div className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm space-y-6">
          
          <FileUploadZone 
            file={imageFile} 
            setFile={setImageFile} 
            accept="image/*" 
            type="image" 
            label="Image de référence"
            optional
          />

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">Prompt (Description) <span className="text-red-500">*</span></label>
            <textarea 
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ex: A futuristic city at night..."
              className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 min-h-[100px] resize-none"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100">
              {error}
            </div>
          )}

          <button 
            onClick={handleGenerate}
            disabled={isGenerating || !prompt}
            className="w-full py-4 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm"
          >
            {isGenerating ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                {status || 'Génération...'}
              </>
            ) : (
              <>
                <Sparkles size={18} />
                Générer l'image (-25 crédits)
              </>
            )}
          </button>
        </div>

        {generatedImage && (
          <div className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm space-y-4">
            <h3 className="text-lg font-medium">Résultat</h3>
            <div className="rounded-xl overflow-hidden border border-neutral-200 bg-neutral-50 flex items-center justify-center relative group">
              <img src={generatedImage} alt="Generated" className="w-full h-auto object-contain" />
            </div>
            <button 
              onClick={handleDownload}
              className="w-full py-3 bg-neutral-900 text-white rounded-xl font-medium hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2"
            >
              <Download size={18} />
              Télécharger l'image
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function FileUploadZone({ file, setFile, accept, type, label, optional = false }: { file: File | null, setFile: (f: File | null) => void, accept: string, type: 'video' | 'image', label: string, optional?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const previewUrl = file ? URL.createObjectURL(file) : null;

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-neutral-700">
        {label} {optional && <span className="text-neutral-400 font-normal">(Optionnel)</span>}
      </label>
      <div 
        onClick={() => !file && inputRef.current?.click()}
        className={`relative overflow-hidden border-2 border-dashed rounded-xl transition-colors flex flex-col items-center justify-center text-center aspect-video
          ${file ? 'border-neutral-200 bg-black' : 'border-neutral-200 bg-neutral-50 hover:border-neutral-300 hover:bg-neutral-100 cursor-pointer'}`}
      >
        <input 
          type="file" 
          ref={inputRef} 
          onChange={handleFileChange} 
          accept={accept} 
          className="hidden" 
        />
        
        {file && previewUrl ? (
          <>
            {type === 'video' ? (
              <video src={previewUrl} className="w-full h-full object-contain opacity-80" />
            ) : (
              <img src={previewUrl} className="w-full h-full object-contain opacity-80" alt="Preview" />
            )}
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 opacity-0 hover:opacity-100 transition-opacity">
              <button 
                onClick={(e) => { e.stopPropagation(); setFile(null); }}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
              >
                Supprimer
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 p-4">
            <div className="p-3 bg-white text-neutral-400 rounded-full shadow-sm">
              <UploadCloud size={24} />
            </div>
            <div>
              <p className="font-medium text-neutral-700 text-sm">Importer un fichier</p>
              <p className="text-xs text-neutral-400 mt-1">Glissez-déposez ou cliquez</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CreditsView({ credits, transactions, user }: { credits: number, transactions: Transaction[], user: SupabaseUser }) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePurchase = async (productId: string, price?: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productId: productId,
          customerPrice: price,
          email: user.email,
          firstName: user.user_metadata?.full_name?.split(' ')[0] || 'Utilisateur',
          lastName: user.user_metadata?.full_name?.split(' ').slice(1).join(' ') || 'Face IA',
          redirectUrl: window.location.href
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erreur lors de l'initialisation du paiement");
      }

      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      } else {
        throw new Error("Réponse inattendue du serveur de paiement");
      }
    } catch (err: any) {
      console.error("Purchase error:", err);
      setError(err.message || "Une erreur est survenue lors du paiement");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6 h-full overflow-y-auto pb-24">
      <h2 className="text-2xl font-light tracking-tight mb-6">Crédits & Forfaits</h2>
      
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* Current Balance Card */}
      <div className="bg-gradient-to-br from-neutral-900 to-neutral-800 p-6 rounded-3xl text-white shadow-lg mb-8 relative overflow-hidden">
        <div className="absolute -top-4 -right-4 p-6 opacity-10 transform rotate-12">
          <Zap size={140} className="fill-white" />
        </div>
        <div className="relative z-10">
          <span className="text-neutral-400 font-medium text-sm uppercase tracking-wider">Solde disponible</span>
          <div className="flex items-baseline gap-2 mt-2 mb-6">
            <span className="text-5xl font-light tracking-tight">{credits}</span>
            <span className="text-neutral-400">crédits</span>
          </div>
          <button className="bg-white text-neutral-900 px-6 py-3 rounded-xl font-medium hover:bg-neutral-100 transition-colors flex items-center justify-center gap-2 w-full sm:w-auto shadow-sm">
            <Zap size={18} className="text-yellow-500" />
            Recharger maintenant
          </button>
        </div>
      </div>

      {/* Pricing Tiers */}
      <h3 className="text-lg font-medium mb-4">Packs de crédits</h3>
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div 
          onClick={() => !isLoading && handlePurchase('3f309d55-bbf4-4fe7-9cea-51e5f5a75f79', 10000)}
          className={`bg-white p-5 rounded-2xl border border-neutral-200 shadow-sm flex flex-col items-center text-center hover:border-neutral-300 transition-colors cursor-pointer ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}
        >
          <div className="text-2xl font-semibold mb-1">4000</div>
          <div className="text-sm text-neutral-500 mb-4">crédits</div>
          <div className="text-lg font-medium">10 000 FCFA</div>
        </div>
        <div 
          onClick={() => !isLoading && handlePurchase('1b9221c9-901f-4fca-9ad3-fea9c8d864ec', 25000)}
          className={`bg-gradient-to-br from-amber-50 to-orange-50 p-5 rounded-2xl border border-amber-200 shadow-sm flex flex-col items-center text-center relative overflow-hidden cursor-pointer hover:border-amber-300 transition-colors ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}
        >
          <div className="absolute top-0 inset-x-0 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[10px] font-bold uppercase py-1 tracking-wider">Premium</div>
          <div className="text-2xl font-semibold mb-1 mt-3 text-amber-900">10 000</div>
          <div className="text-sm text-amber-700/70 mb-4">crédits</div>
          <div className="text-lg font-medium text-amber-900">25 000 FCFA</div>
        </div>
      </div>

      {/* History */}
      <h3 className="text-lg font-medium mb-4">Historique récent</h3>
      {transactions.length > 0 ? (
        <div className="space-y-3">
          {transactions.map((tx) => (
            <div key={tx.id} className="flex items-center justify-between bg-white p-4 rounded-xl border border-neutral-100 shadow-sm">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${tx.amount < 0 ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'}`}>
                  {tx.type === 'video_generation' ? <Video size={16} /> : tx.type === 'image_generation' ? <ImageIcon size={16} /> : <CreditCard size={16} />}
                </div>
                <div>
                  <div className="font-medium text-sm">{tx.description}</div>
                  <div className="text-xs text-neutral-500">{new Date(tx.createdAt).toLocaleString()}</div>
                </div>
              </div>
              <div className={`font-medium text-sm ${tx.amount < 0 ? 'text-neutral-900' : 'text-green-600'}`}>
                {tx.amount > 0 ? '+' : ''}{tx.amount}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white p-8 rounded-2xl border border-neutral-200 shadow-sm flex flex-col items-center justify-center text-center">
          <div className="bg-neutral-100 p-3 rounded-full mb-3">
            <Library size={24} className="text-neutral-400" />
          </div>
          <p className="text-neutral-500 text-sm">Aucune transaction pour le moment.</p>
        </div>
      )}
    </div>
  );
}

function ProfileView({ user }: { user: SupabaseUser }) {
  const logout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="p-6 h-full">
      <h2 className="text-2xl font-light tracking-tight mb-6">Profil</h2>
      <div className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm flex items-center gap-4 mb-6">
        {user.user_metadata?.avatar_url ? (
          <img src={user.user_metadata.avatar_url} alt="Profile" className="w-16 h-16 rounded-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center text-neutral-400">
            <User size={32} />
          </div>
        )}
        <div>
          <h3 className="text-lg font-medium">{user.user_metadata?.full_name || 'Utilisateur'}</h3>
          <p className="text-neutral-500">{user.email}</p>
        </div>
      </div>
      
      <div className="space-y-2">
        <button onClick={logout} className="w-full flex items-center justify-between p-4 bg-white rounded-xl border border-neutral-200 text-red-600 hover:bg-red-50 transition-colors">
          <span>Déconnexion</span>
        </button>
      </div>
    </div>
  );
}
