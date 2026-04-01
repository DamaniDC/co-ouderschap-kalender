import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { supabase } from "./supabase";
import LoginPage from "./pages/LoginPage";
import CalendarPage from "./pages/CalendarPage";

export default function App() {
  const [currentUserEmail, setCurrentUserEmail] = useState<string>("");
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    async function initAuth() {
      const { data } = await supabase.auth.getSession();
      setCurrentUserEmail(data.session?.user?.email ?? "");
      setAuthLoading(false);
    }

    initAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUserEmail(session?.user?.email ?? "");
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (authLoading) {
    return (
      <div className="fullscreen-center">
        <div className="auth-card">
          <h1 className="auth-title">Laden...</h1>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={
          currentUserEmail ? <Navigate to="/" replace /> : <LoginPage />
        }
      />
      <Route
        path="/"
        element={
          currentUserEmail ? (
            <CalendarPage currentUserEmail={currentUserEmail} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="*"
        element={<Navigate to={currentUserEmail ? "/" : "/login"} replace />}
      />
    </Routes>
  );
}