"use client";

import { KanbanBoard } from "@/components/KanbanBoard";
import {
  login,
  register,
  logout,
  fetchBoards,
  storeToken,
  clearToken,
  getStoredToken,
  ApiError,
} from "@/lib/api";
import type { BoardSummary } from "@/lib/api";
import { useEffect, useState, type FormEvent } from "react";

type AppState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "authenticated"; username: string; boards: BoardSummary[]; activeBoardId: string };

export default function Home() {
  const [state, setState] = useState<AppState>({ status: "loading" });

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setState({ status: "unauthenticated" });
      return;
    }
    // Verify the stored token is still valid
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (!res.ok) throw new Error("Invalid token");
        return res.json() as Promise<{ username: string }>;
      })
      .then(({ username }) =>
        fetchBoards().then((boards) => {
          const activeBoardId = boards[0]?.id ?? "";
          setState({ status: "authenticated", username, boards, activeBoardId });
        })
      )
      .catch(() => {
        clearToken();
        setState({ status: "unauthenticated" });
      });
  }, []);

  const handleLogin = async (username: string, password: string) => {
    const result = await login(username, password);
    storeToken(result.token);
    const boards = await fetchBoards();
    setState({
      status: "authenticated",
      username: result.username,
      boards,
      activeBoardId: boards[0]?.id ?? "",
    });
  };

  const handleRegister = async (username: string, password: string) => {
    const result = await register(username, password);
    storeToken(result.token);
    const boards = await fetchBoards();
    setState({
      status: "authenticated",
      username: result.username,
      boards,
      activeBoardId: boards[0]?.id ?? "",
    });
  };

  const handleLogout = async () => {
    await logout();
    clearToken();
    setState({ status: "unauthenticated" });
  };

  if (state.status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface)]">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
          Loading
        </p>
      </div>
    );
  }

  if (state.status === "unauthenticated") {
    return (
      <AuthScreen onLogin={handleLogin} onRegister={handleRegister} />
    );
  }

  return (
    <KanbanBoard
      onLogout={() => void handleLogout()}
      userName={state.username}
      boards={state.boards}
      activeBoardId={state.activeBoardId}
      onBoardsChange={(boards) =>
        setState({ ...state, boards })
      }
      onActiveBoardChange={(activeBoardId) =>
        setState({ ...state, activeBoardId })
      }
    />
  );
}

type AuthScreenProps = {
  onLogin: (username: string, password: string) => Promise<void>;
  onRegister: (username: string, password: string) => Promise<void>;
};

const AuthScreen = ({ onLogin, onRegister }: AuthScreenProps) => {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("user");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      if (mode === "login") {
        await onLogin(username.trim(), password);
      } else {
        await onRegister(username.trim(), password);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const switchMode = (next: "login" | "register") => {
    setMode(next);
    setError(null);
    setPassword("");
    if (next === "register") setUsername("");
    else setUsername("user");
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--surface)] px-6 py-12">
      <div className="pointer-events-none absolute left-0 top-0 h-[380px] w-[380px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[460px] w-[460px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="relative w-full max-w-md rounded-[28px] border border-[var(--stroke)] bg-white/90 p-8 shadow-[var(--shadow)] backdrop-blur"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
          {mode === "login" ? "Sign in" : "Create account"}
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold text-[var(--navy-dark)]">
          {mode === "login" ? "Welcome back" : "Get started"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-[var(--gray-text)]">
          {mode === "login"
            ? "Sign in to access your project boards."
            : "Create an account to start managing your projects."}
        </p>

        <div className="mt-6 space-y-4">
          <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
            Username
            <input
              className="rounded-xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm font-medium text-[var(--navy-dark)] shadow-sm focus:border-[var(--primary-blue)] focus:outline-none"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </label>
          <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
            Password
            <input
              className="rounded-xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm font-medium text-[var(--navy-dark)] shadow-sm focus:border-[var(--primary-blue)] focus:outline-none"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
        </div>

        {error ? (
          <p className="mt-4 rounded-xl border border-[color:rgba(117,57,145,0.3)] bg-[color:rgba(117,57,145,0.08)] px-4 py-3 text-sm font-medium text-[var(--secondary-purple)]">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-6 w-full rounded-xl bg-[var(--secondary-purple)] px-5 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-[color:rgba(117,57,145,0.9)] disabled:opacity-60"
        >
          {isSubmitting
            ? mode === "login" ? "Signing in" : "Creating account"
            : mode === "login" ? "Sign in" : "Create account"}
        </button>

        <div className="mt-4 flex items-center justify-between text-xs text-[var(--gray-text)]">
          {mode === "login" ? (
            <>
              <span>Demo: user / password</span>
              <button
                type="button"
                onClick={() => switchMode("register")}
                className="font-semibold text-[var(--primary-blue)] hover:underline"
              >
                Create account
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => switchMode("login")}
              className="font-semibold text-[var(--primary-blue)] hover:underline"
            >
              Already have an account? Sign in
            </button>
          )}
        </div>
      </form>
    </div>
  );
};
