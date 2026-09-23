import { useStore } from '../store';
import { useState } from 'react';
import { Send, Search, Paperclip } from 'lucide-react';

export function ChatView() {
  const { chat, sendChat, brands } = useStore();
  const [input, setInput] = useState('');
  const [activeBrand, setActiveBrand] = useState(brands[0]?.id || '');

  return (
    <div className="p-6 max-w-6xl mx-auto h-[calc(100vh-4rem)]">
      <div className="flex gap-4 h-full">
        <div className="w-64 shrink-0 bg-surface-2 border border-line rounded-xl p-3 overflow-y-auto">
          <div className="relative mb-3">
            <Search size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-2" />
            <input placeholder="Buscar..." className="w-full bg-surface-3 border border-line rounded-lg pl-8 pr-3 py-2 text-sm outline-none focus:border-accent" />
          </div>
          <p className="text-xs text-muted-2 font-medium px-2 mb-2">CANALES</p>
          {brands.map(b => (
            <button
              key={b.id}
              onClick={() => setActiveBrand(b.id)}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors mb-1 ${
                activeBrand === b.id ? 'bg-accent-dim text-accent' : 'text-muted hover:bg-surface-3 hover:text-text'
              }`}
            >
              <span className="font-medium">{b.name}</span>
              <span className="text-xs text-muted-2 block">{b.videos.length} videos</span>
            </button>
          ))}
        </div>

        <div className="flex-1 flex flex-col bg-surface-2 border border-line rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-line flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent-dim flex items-center justify-center">
              <span className="text-sm font-bold text-accent">{brands.find(b => b.id === activeBrand)?.name.charAt(0)}</span>
            </div>
            <div>
              <p className="font-medium text-sm">{brands.find(b => b.id === activeBrand)?.name}</p>
              <p className="text-xs text-mint">3 miembros en línea</p>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {chat.map(m => {
              if (m.type === 'sys') return <div key={m.id} className="text-center text-xs text-muted-2 py-2">{m.text}</div>;
              return (
                <div key={m.id} className={`flex ${m.type === 'out' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${
                    m.type === 'out' ? 'bg-accent text-on-accent rounded-br-sm' : 'bg-surface-3 text-text rounded-bl-sm'
                  }`}>
                    <p className="text-sm">{m.text}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="p-4 border-t border-line">
            <div className="flex items-center gap-2 bg-surface-3 border border-line rounded-xl px-3 py-2">
              <button className="text-muted hover:text-text transition-colors"><Paperclip size={18} /></button>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && input.trim()) { sendChat(input); setInput(''); } }}
                placeholder="Escribe un mensaje..."
                className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-2"
              />
              <button
                onClick={() => { if (input.trim()) { sendChat(input); setInput(''); } }}
                className="w-8 h-8 rounded-lg bg-accent text-on-accent flex items-center justify-center hover:bg-accent-strong transition-colors"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
