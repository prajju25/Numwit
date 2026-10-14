import { useCallback, useEffect, useState } from "react";
import { track } from "../services/analytics";

/**
 * Captures the browser's "install this app" prompt (Chrome/Edge on Android
 * and desktop fire `beforeinstallprompt`) so we can offer our own Install
 * button. iOS Safari doesn't support this — players there use
 * Share → "Add to Home Screen".
 */
export default function useInstallPrompt() {
  const [deferred, setDeferred] = useState(null);

  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault(); // keep it for our button instead of the mini-infobar
      setDeferred(e);
    };
    const onInstalled = () => {
      track("app_installed");
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferred) return;
    deferred.prompt();
    try {
      await deferred.userChoice;
    } finally {
      setDeferred(null); // a prompt event can only be used once
    }
  }, [deferred]);

  return { canInstall: !!deferred, promptInstall };
}
