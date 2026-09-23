import { StoreProvider, useStore } from './store';
import { AuthProvider, useAuth } from './lib/auth';
import { Rail } from './components/Rail';
import { TopBar } from './components/TopBar';
import { BrandBackground } from './components/BrandBackground';
import { HomeView } from './views/HomeView';
import { TasksView } from './views/TasksView';
import { ChatView } from './views/ChatView';
import { CalendarView } from './views/CalendarView';
import { ClassroomView } from './views/ClassroomView';
import { ContractsView } from './views/ContractsView';
import { ProfileView } from './views/ProfileView';
import { AdminView } from './views/AdminView';
import { ConfigView } from './views/ConfigView';
import { LoginView } from './views/LoginView';
import { UserManagement } from './views/UserManagement';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

function Shell() {
  const { view, theme } = useStore();
  const { user, loading, signOut } = useAuth();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

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

  const renderView = () => {
    switch (view) {
      case 'home': return <HomeView />;
      case 'tareas': return <TasksView />;
      case 'chat': return <ChatView />;
      case 'calendario': return <CalendarView />;
      case 'classroom': return <ClassroomView />;
      case 'contratos': return <ContractsView />;
      case 'perfil': return <ProfileView />;
      case 'administracion':
        return (
          <div className="space-y-5">
            <UserManagement />
            <AdminView />
          </div>
        );
      case 'configuracion': return <ConfigView />;
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
