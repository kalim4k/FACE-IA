import React, { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';

export function InstallPWA() {
  const [supportsPWA, setSupportsPWA] = useState(false);
  const [promptInstall, setPromptInstall] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setSupportsPWA(true);
      setPromptInstall(e);
      // Show the prompt after a short delay
      setTimeout(() => setShowPrompt(true), 1000);
    };

    window.addEventListener('beforeinstallprompt', handler);

    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setShowPrompt(false);
      console.log('FACE IA a été installée avec succès');
    });

    // Check if already installed (standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const onClick = (evt: React.MouseEvent<HTMLButtonElement>) => {
    evt.preventDefault();
    if (!promptInstall) {
      return;
    }
    promptInstall.prompt();
    promptInstall.userChoice.then((choiceResult: any) => {
      if (choiceResult.outcome === 'accepted') {
        console.log('L\'utilisateur a accepté l\'installation');
        setShowPrompt(false);
      } else {
        console.log('L\'utilisateur a refusé l\'installation');
        setShowPrompt(false);
      }
    });
  };

  const onDismiss = () => {
    setShowPrompt(false);
  };

  if (!supportsPWA || isInstalled || !showPrompt) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-white rounded-2xl shadow-2xl border border-neutral-100 p-4 z-50 animate-in slide-in-from-bottom-5 fade-in duration-300">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <img 
            src="https://ysbiedwkakdqadxtuwab.supabase.co/storage/v1/object/public/uploads/179cc21d-f672-40ea-b233-dcec904e3586.jpg" 
            alt="FACE IA Icon" 
            className="w-12 h-12 rounded-2xl object-cover shadow-sm"
            referrerPolicy="no-referrer"
          />
          <div>
            <h3 className="font-semibold text-neutral-900">Installer FACE IA</h3>
            <p className="text-sm text-neutral-500">Ajoutez l'application à votre écran d'accueil pour un accès rapide.</p>
          </div>
        </div>
        <button 
          onClick={onDismiss}
          className="text-neutral-400 hover:text-neutral-600 transition-colors p-1"
        >
          <X size={20} />
        </button>
      </div>
      <div className="mt-4 flex gap-2">
        <button 
          onClick={onClick}
          className="flex-1 bg-black text-white py-2.5 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-neutral-800 transition-colors"
        >
          <Download size={18} />
          Installer
        </button>
      </div>
    </div>
  );
}
