import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import type { Role } from '../types';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

interface AuthState {
  user: AuthUser | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | null>(null);

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (authUser: User): Promise<AuthUser | null> => {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, role')
      .eq('id', authUser.id)
      .maybeSingle();
    if (error || !data) return null;
    return {
      id: data.id,
      email: authUser.email || '',
      name: data.name,
      role: data.role as Role,
    };
  }, []);

  useEffect(() => {
    if (!supabase || !isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    let active = true;

    (async () => {
      const { data: { session: s } } = await supabase.auth.getSession();
      if (!active) return;
      setSession(s);
      if (s?.user) {
        const profile = await fetchProfile(s.user);
        if (active) setUser(profile);
      }
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      (async () => {
        setSession(s);
        if (s?.user) {
          const profile = await fetchProfile(s.user);
          setUser(profile);
        } else {
          setUser(null);
        }
      })();
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signIn = useCallback(async (email: string, password: string): Promise<{ error: string | null }> => {
    if (!supabase) return { error: 'Supabase no está configurado' };
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    if (data.user) {
      const profile = await fetchProfile(data.user);
      setUser(profile);
    }
    return { error: null };
  }, [fetchProfile]);

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  }, []);

  return (
    <AuthCtx.Provider value={{ user, session, loading, signIn, signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}
