import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";

import { getInitialSession, signInWithPassword, signOut, subscribeToAuthChanges } from "../../lib/supabase/services";
import { isSupabaseConfigured } from "../../lib/supabase/client";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isDemo: boolean;
  signInUser: (email: string, password: string) => Promise<void>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    getInitialSession()
      .then(({ session: currentSession, user: currentUser }) => {
        if (!mounted) {
          return;
        }

        setSession(currentSession);
        setUser(currentUser);
        setLoading(false);
      })
      .catch(() => {
        if (!mounted) {
          return;
        }

        setLoading(false);
      });

    const unsubscribe = subscribeToAuthChanges((nextSession) => {
      if (!mounted) {
        return;
      }

      setSession(nextSession);
      setUser(nextSession?.user ?? null);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  async function handleSignIn(email: string, password: string) {
    const result = await signInWithPassword(email, password);
    const nextSession = "session" in result ? result.session ?? null : null;
    const nextUser = "user" in result ? result.user ?? null : null;

    setSession(nextSession);
    setUser(nextUser);
  }

  async function handleSignOut() {
    await signOut();
    if (!isSupabaseConfigured) {
      setUser(null);
      setSession(null);
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        isDemo: !isSupabaseConfigured,
        signInUser: handleSignIn,
        signOutUser: handleSignOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
