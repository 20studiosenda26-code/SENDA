import { StoreProvider, useStore } from './store';
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
import { useEffect } from 'react';

function Shell() {
  const { view, theme } = useStore();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const renderView = () => {
    switch (view) {
      case 'home': return <HomeView />;
      case 'tareas': return <TasksView />;
      case 'chat': return <ChatView />;
      case 'calendario': return <CalendarView />;
      case 'classroom': return <ClassroomView />;
      case 'contratos': return <ContractsView />;
      case 'perfil': return <ProfileView />;
      case 'administracion': return <AdminView />;
      case 'configuracion': return <ConfigView />;
      default: return <HomeView />;
    }
  };

  return (
    <div className="min-h-screen bg-ink text-text relative">
      <BrandBackground />
      <div className="relative z-10">
        <Rail />
        <div className="ml-16">
          <TopBar />
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
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
