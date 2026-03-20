import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";

import {
  endDemoSession,
  getDemoSessionExpiresAt,
  getInitialSession,
  isDemoModeActive,
  signInWithPassword,
  signOut,
  startDemoSession,
  subscribeToAuthChanges,
} from "../../lib/supabase/services";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isDemo: boolean;
  demoExpiresAt: string | null;
  signInUser: (email: string, password: string) => Promise<void>;
  startDemoUser: () => Promise<void>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(() => isDemoModeActive());
  const [demoExpiresAt, setDemoExpiresAt] = useState<string | null>(() => getDemoSessionExpiresAt());

  useEffect(() => {
    let mounted = true;

    getInitialSession()
      .then(({ session: currentSession, user: currentUser }) => {
        if (!mounted) {
          return;
        }

        setSession(currentSession);
        setUser(currentUser);
        setIsDemo(isDemoModeActive());
        setDemoExpiresAt(getDemoSessionExpiresAt());
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

      if (isDemoModeActive()) {
        return;
      }

      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setIsDemo(false);
      setDemoExpiresAt(null);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isDemo || !demoExpiresAt) {
      return;
    }

    const remaining = new Date(demoExpiresAt).getTime() - Date.now();

    if (remaining <= 0) {
      endDemoSession();
      setUser(null);
      setSession(null);
      setIsDemo(false);
      setDemoExpiresAt(null);
      return;
    }

    const timer = window.setTimeout(() => {
      endDemoSession();
      setUser(null);
      setSession(null);
      setIsDemo(false);
      setDemoExpiresAt(null);
    }, remaining + 250);

    return () => window.clearTimeout(timer);
  }, [demoExpiresAt, isDemo]);

  async function handleSignIn(email: string, password: string) {
    if (isDemoModeActive()) {
      endDemoSession();
      setIsDemo(false);
      setDemoExpiresAt(null);
    }

    const result = await signInWithPassword(email, password);
    const nextSession = "session" in result ? result.session ?? null : null;
    const nextUser = "user" in result ? result.user ?? null : null;

    setSession(nextSession);
    setUser(nextUser);
    setIsDemo(false);
    setDemoExpiresAt(null);
  }

  async function handleStartDemo() {
    const result = startDemoSession();
    setSession(result.session);
    setUser(result.user);
    setIsDemo(true);
    setDemoExpiresAt(result.expiresAt);
  }

  async function handleSignOut() {
    if (isDemoModeActive()) {
      endDemoSession();
      setUser(null);
      setSession(null);
      setIsDemo(false);
      setDemoExpiresAt(null);
      return;
    }

    await signOut();
    setUser(null);
    setSession(null);
    setIsDemo(false);
    setDemoExpiresAt(null);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        isDemo,
        demoExpiresAt,
        signInUser: handleSignIn,
        startDemoUser: handleStartDemo,
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
