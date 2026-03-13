import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import type { AppSettings } from "../../lib/supabase/types";
import { fetchAppSettings, updateAppSettings } from "../../lib/supabase/services";
import { useAuth } from "../auth/useAuth";

interface AppSettingsContextValue {
  settings: AppSettings | null;
  loading: boolean;
  error: string;
  refreshSettings: () => Promise<void>;
  saveSettings: (input: Pick<AppSettings, "clinicName" | "fullName" | "timezone" | "plan">) => Promise<AppSettings>;
}

const AppSettingsContext = createContext<AppSettingsContextValue | undefined>(undefined);

function extractErrorMessage(exception: unknown) {
  if (exception instanceof Error) {
    return exception.message;
  }

  if (exception && typeof exception === "object" && "message" in exception) {
    const message = (exception as { message?: unknown }).message;

    if (typeof message === "string" && message) {
      return message;
    }
  }

  return "Nao foi possivel carregar as configuracoes.";
}

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadSettings() {
    setLoading(true);
    setError("");

    try {
      const result = await fetchAppSettings();
      setSettings(result);
    } catch (exception) {
      setSettings((current) => {
        if (current) {
          return current;
        }

        const fullName =
          (typeof user?.user_metadata?.full_name === "string" && user.user_metadata.full_name) ||
          user?.email?.split("@")[0] ||
          "ClinPlanner";
        const clinicName =
          (typeof user?.user_metadata?.clinic_name === "string" && user.user_metadata.clinic_name) || fullName;

        return {
          clinicName,
          fullName,
          email: user?.email ?? "",
          timezone: "America/Sao_Paulo",
          plan: "starter",
        };
      });
      setError(extractErrorMessage(exception));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user) {
      setSettings(null);
      setLoading(false);
      return;
    }

    loadSettings();
  }, [authLoading, user?.id]);

  async function saveSettings(input: Pick<AppSettings, "clinicName" | "fullName" | "timezone" | "plan">) {
    const updated = await updateAppSettings(input);
    setSettings(updated);
    return updated;
  }

  return (
    <AppSettingsContext.Provider
      value={{
        settings,
        loading,
        error,
        refreshSettings: loadSettings,
        saveSettings,
      }}
    >
      {children}
    </AppSettingsContext.Provider>
  );
}

export function useAppSettings() {
  const context = useContext(AppSettingsContext);

  if (!context) {
    throw new Error("useAppSettings must be used inside AppSettingsProvider");
  }

  return context;
}
