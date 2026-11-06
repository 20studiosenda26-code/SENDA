import { WelcomeAudio } from "./components/WelcomeAudio";
import { StoreProvider, useStore } from './store';
import { AuthProvider, useAuth } from './lib/auth';
import { Rail } from './components/Rail';
import { TopBar } from './components/TopBar';
import { BrandBackground } from './components/BrandBackground';
import { HomeView } from './views/HomeView';
import { TasksView } from './views/TasksView';
import { ClientsView } from './views/ClientsView';
import { ChatView } from './views/ChatView';
import { CalendarView } from './views/CalendarView';
import { ClassroomView } from './views/ClassroomView';
import { ContractsView } from './views/ContractsView';
import { ProfileView } from './views/ProfileView';
import { FinancesView } from './views/FinancesView';
import { PayrollView } from './views/PayrollView';
import { CapacityView } from './views/CapacityView';
import { AdminView } from './views/AdminView';
import { LoginView } from './views/LoginView';
import { UserManagement } from './views/UserManagement';
import { SettingsPanel } from './views/SettingsPanel';
import { ClientHome, ClientBriefs } from './views/ClientArea';
import { ClientPortal } from './views/ClientPortal';
import MorphOrb from './components/ui/ai-thiking-orb-and-input';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { downloadMediaFile } from './lib/supabaseClient';

function Shell() {
  const { view, setView, theme } = useStore();
  const { user, loading, signOut } = useAuth();
  const [showWelcomeOrb, setShowWelcomeOrb] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Cualquier enlace con "download" en la app descarga directo, sin abrir otra pestaña
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.('a[download]') as HTMLAnchorElement | null;
      if (!a || !a.href || a.href.startsWith(window.location.origin)) return;
      e.preventDefault();
      void downloadMediaFile(a.href, a.getAttribute('download') || undefined);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  // Cada sección abre arriba (antes conservaba el scroll de la vista anterior)
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [view]);

  useEffect(() => {
    if (user?.role === 'admin' && view === 'perfil') {
      setView('home');
    }
  }, [user?.role, view, setView]);

  useEffect(() => {
    if (user) {
      try {
        if (sessionStorage.getItem('senda_show_welcome_orb') === '1') {
          sessionStorage.removeItem('senda_show_welcome_orb');
          setShowWelcomeOrb(true);
        }
      } catch {
        // ignorar
      }
    }
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-accent" />
      </div>
    );
  }

  if (!user) {
    return <LoginView />;
  }

  if (showWelcomeOrb) {
    return (
      <MorphOrb
        autoStart
        initialText={`Autenticando a ${user.name}...`}
        minThinkMs={1800}
        speed={1.25}
        onSubmit={() => "Bienvenido a SENDA"}
        onComplete={() => setShowWelcomeOrb(false)}
      />
    );
  }

  const renderView = () => {
    // El cliente solo ve su portal: inicio, brief de sus proyectos, revisión de videos y chat con SENDA
    if (user.role === 'cliente') {
      switch (view) {
        case 'brief': return <ClientBriefs />;
        case 'revision': return <div className="p-6 max-w-7xl mx-auto"><ClientPortal /></div>;
        case 'chat': return <ChatView />;
        default: return <ClientHome />;
      }
    }
    switch (view) {
      case 'home': return <HomeView />;
      case 'tareas': return <TasksView />;
      case 'clientes': return user.role === 'admin' ? <ClientsView /> : <HomeView />;
      case 'chat': return <ChatView />;
      case 'calendario': return <CalendarView />;
      case 'classroom': return <ClassroomView />;
      case 'contratos': return <ContractsView />;
      case 'perfil': return user.role === 'admin' ? <HomeView /> : <ProfileView />;
      case 'finanzas': return user.role === 'admin' ? <FinancesView /> : <HomeView />;
      case 'nominas': return user.role === 'admin' ? <PayrollView /> : <HomeView />;
      case 'capacidad': return user.role === 'admin' ? <CapacityView /> : <HomeView />;
      case 'administracion':
        return (
          <div className="p-6 max-w-6xl mx-auto space-y-5">
            <UserManagement />
            <AdminView />
            <SettingsPanel />
          </div>
        );
      default: return <HomeView />;
    }
  };

  return (
    <div className="min-h-screen bg-ink text-text relative">
      <BrandBackground />
      <div className="relative z-10">
        <Rail onSignOut={signOut} />
        <div className="ml-16">
          <TopBar authUser={user} onSignOut={signOut} />
          <main className="min-h-[calc(100vh-4rem)]">
            {renderView()}
          </main>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <StoreProvider>
        <Shell />
      </StoreProvider>
    </AuthProvider>
  );
}
