"use client";

import { KanbanBoard } from "@/components/KanbanBoard";
import { useState, type FormEvent } from "react";

const VALID_USERNAME = "user";
const VALID_PASSWORD = "password";

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = (username: string, password: string) => {
    if (username === VALID_USERNAME && password === VALID_PASSWORD) {
      setIsAuthenticated(true);
      setError(null);
      return;
    }

    setError("Invalid username or password.");
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return <LoginScreen onLogin={handleLogin} error={error} />;
  }

  return <KanbanBoard onLogout={handleLogout} userName={VALID_USERNAME} />;
}

type LoginScreenProps = {
  onLogin: (username: string, password: string) => void;
  error: string | null;
};

const LoginScreen = ({ onLogin, error }: LoginScreenProps) => {
  const [username, setUsername] = useState(VALID_USERNAME);
  const [password, setPassword] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onLogin(username.trim(), password);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--surface)] px-6 py-12">
      <div className="pointer-events-none absolute left-0 top-0 h-[380px] w-[380px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[460px] w-[460px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-md rounded-[28px] border border-[var(--stroke)] bg-white/90 p-8 shadow-[var(--shadow)] backdrop-blur"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
          Sign in
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold text-[var(--navy-dark)]">
          Welcome back
        </h1>
        <p className="mt-2 text-sm leading-6 text-[var(--gray-text)]">
          Use the demo credentials to access the project board.
        </p>

        <div className="mt-6 space-y-4">
          <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
            Username
            <input
              className="rounded-xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm font-medium text-[var(--navy-dark)] shadow-sm focus:border-[var(--primary-blue)] focus:outline-none"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
            Password
            <input
              className="rounded-xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm font-medium text-[var(--navy-dark)] shadow-sm focus:border-[var(--primary-blue)] focus:outline-none"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
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
          className="mt-6 w-full rounded-xl bg-[var(--secondary-purple)] px-5 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-[color:rgba(117,57,145,0.9)]"
        >
          Sign in
        </button>
        <p className="mt-4 text-xs text-[var(--gray-text)]">
          Demo credentials: user / password
        </p>
      </form>
    </div>
  );
};
