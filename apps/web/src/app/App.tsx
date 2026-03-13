import { useEffect } from "react";
import { BrowserRouter, HashRouter } from "react-router-dom";

import { AuthProvider } from "../features/auth/useAuth";
import { AppSettingsProvider } from "../features/settings/useAppSettings";
import { applyTheme, getPreferredTheme } from "../lib/utils/theme";
import { AppRouter } from "./router";
import faviconSrc from "../../../../ClinPlanner.png";

export function App() {
  useEffect(() => {
    let favicon = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;

    if (!favicon) {
      favicon = document.createElement("link");
      favicon.rel = "icon";
      document.head.appendChild(favicon);
    }

    favicon.type = "image/png";
    favicon.href = faviconSrc;
    applyTheme(getPreferredTheme());
  }, []);

  const RouterComponent = window.location.protocol === "file:" ? HashRouter : BrowserRouter;

  return (
    <AuthProvider>
      <AppSettingsProvider>
        <RouterComponent>
          <AppRouter />
        </RouterComponent>
      </AppSettingsProvider>
    </AuthProvider>
  );
}
