import { useState } from "react";
import { supabase } from "../supabase";

export default function LoginPage() {
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");

  async function handleAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAuthBusy(true);
    setAuthMessage("");

    try {
      if (authMode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: authEmail,
          password: authPassword,
        });

        if (error) throw error;

        setAuthMessage(
          "Account aangemaakt. Mogelijk moet je eerst je e-mail bevestigen."
        );
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password: authPassword,
        });

        if (error) throw error;

        setAuthMessage("Succesvol ingelogd.");
      }
    } catch (error: any) {
      setAuthMessage(error.message || "Er ging iets mis.");
    } finally {
      setAuthBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="auth-header">
          <h1 className="auth-title">Co-ouderschap kalender</h1>
          <p className="auth-subtitle">
            {authMode === "signup"
              ? "Maak een account aan om toegang te krijgen."
              : "Log in om de kalender te openen."}
          </p>
        </div>

        <div className="auth-mode-switch">
          <button
            type="button"
            className={`ghost-btn ${authMode === "login" ? "mode-active" : ""}`}
            onClick={() => setAuthMode("login")}
          >
            Inloggen
          </button>

          <button
            type="button"
            className={`ghost-btn ${authMode === "signup" ? "mode-active" : ""}`}
            onClick={() => setAuthMode("signup")}
          >
            Account aanmaken
          </button>
        </div>

        <form onSubmit={handleAuthSubmit} className="auth-form">
          <input
            type="email"
            placeholder="E-mailadres"
            value={authEmail}
            onChange={(e) => setAuthEmail(e.target.value)}
            className="auth-input"
          />

          <input
            type="password"
            placeholder="Wachtwoord"
            value={authPassword}
            onChange={(e) => setAuthPassword(e.target.value)}
            className="auth-input"
          />

          <button type="submit" className="primary-btn" disabled={authBusy}>
            {authBusy
              ? "Bezig..."
              : authMode === "signup"
              ? "Account aanmaken"
              : "Inloggen"}
          </button>
        </form>

        {authMessage && <div className="auth-message">{authMessage}</div>}
      </div>
    </div>
  );
}