// Mensajes sin leer del chat (estilo WhatsApp), igual para todos los roles.
// Cada persona guarda en este navegador hasta qué mensaje leyó en cada conversación.
// Se marca como leído con la fecha del último mensaje (no la hora del equipo) para evitar desfases de reloj.
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useStore } from '../store';
import { useAuth } from './auth';
import type { ChatMsg } from '../types';

const listeners = new Set<() => void>();
let version = 0;
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
const getVersion = () => version;
const bump = () => { version++; listeners.forEach(l => l()); };

const keyOf = (uid: string) => `senda_chat_read_${uid}`;

function loadMap(uid: string): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(keyOf(uid));
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    // Primera vez en este navegador: lo anterior no cuenta como "sin leer"
    if (!map.__init) {
      map.__init = new Date().toISOString();
      window.localStorage.setItem(keyOf(uid), JSON.stringify(map));
    }
    return map;
  } catch {
    return { __init: new Date().toISOString() };
  }
}

function saveRead(uid: string, groupId: string, iso: string) {
  try {
    const map = loadMap(uid);
    if (map[groupId] && map[groupId] >= iso) return;
    map[groupId] = iso;
    window.localStorage.setItem(keyOf(uid), JSON.stringify(map));
  } catch { /* sin almacenamiento: no pasa nada */ }
  bump();
}

export interface ChatUnread {
  /** Mensajes sin leer por conversación */
  unread: Record<string, number>;
  /** Último mensaje por conversación */
  lastMsg: Record<string, ChatMsg>;
  total: number;
  markRead: (groupId: string) => void;
}

export function useChatUnread(): ChatUnread {
  const { chatMessages, chatGroups } = useStore();
  const { user } = useAuth();
  const uid = user?.id || '';
  const v = useSyncExternalStore(subscribe, getVersion, getVersion);

  const { unread, lastMsg, total } = useMemo(() => {
    const unread: Record<string, number> = {};
    const lastMsg: Record<string, ChatMsg> = {};
    let total = 0;
    const map = uid ? loadMap(uid) : {};
    for (const m of chatMessages) {
      const last = lastMsg[m.groupId];
      if (!last || m.createdAt > last.createdAt) lastMsg[m.groupId] = m;
      if (!uid || m.senderId === uid) continue;
      // Solo cuentan las conversaciones donde la persona participa
      const g = chatGroups.find(x => x.id === m.groupId);
      if (!g || !g.memberIds.includes(uid)) continue;
      const seen = map[m.groupId] || map.__init || '';
      if (m.createdAt > seen) { unread[m.groupId] = (unread[m.groupId] || 0) + 1; total++; }
    }
    return { unread, lastMsg, total };
    // v cambia cuando se marca algo como leído
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatMessages, chatGroups, uid, v]);

  const markRead = useCallback((groupId: string) => {
    if (!uid) return;
    const last = lastMsg[groupId];
    if (last) saveRead(uid, groupId, last.createdAt);
  }, [uid, lastMsg]);

  return { unread, lastMsg, total, markRead };
}
