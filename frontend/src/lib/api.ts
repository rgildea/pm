import type { BoardData } from "./kanban";

const TOKEN_KEY = "pm_token";

export type BoardSummary = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type AuthResult = {
  token: string;
  username: string;
};

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function storeToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

function authHeaders(): Record<string, string> {
  const token = getStoredToken();
  return token
    ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
    : { "Content-Type": "application/json" };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    if (res.status === 401) {
      clearToken();
    }
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(res.status, body.detail ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export async function login(username: string, password: string): Promise<AuthResult> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return handleResponse<AuthResult>(res);
}

export async function register(username: string, password: string): Promise<AuthResult> {
  const res = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return handleResponse<AuthResult>(res);
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", {
    method: "POST",
    headers: authHeaders(),
  });
}

export async function fetchBoards(): Promise<BoardSummary[]> {
  const res = await fetch("/api/boards", { headers: authHeaders() });
  const data = await handleResponse<{ boards: BoardSummary[] }>(res);
  return data.boards;
}

export async function createBoard(title: string): Promise<{ id: string; title: string }> {
  const res = await fetch("/api/boards", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ title }),
  });
  const data = await handleResponse<{ board: { id: string; title: string } }>(res);
  return data.board;
}

export async function fetchBoard(boardId: string): Promise<{ board: BoardData; title: string }> {
  const res = await fetch(`/api/boards/${boardId}`, { headers: authHeaders() });
  return handleResponse<{ board: BoardData; title: string }>(res);
}

export async function persistBoard(boardId: string, board: BoardData): Promise<BoardData> {
  const res = await fetch(`/api/boards/${boardId}`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({ board }),
  });
  const data = await handleResponse<{ board: BoardData }>(res);
  return data.board;
}

export async function renameBoard(boardId: string, title: string): Promise<{ id: string; title: string }> {
  const res = await fetch(`/api/boards/${boardId}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ title }),
  });
  return handleResponse<{ id: string; title: string }>(res);
}

export async function deleteBoard(boardId: string): Promise<void> {
  const res = await fetch(`/api/boards/${boardId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  await handleResponse<{ ok: boolean }>(res);
}

export async function sendAiChat(
  boardId: string,
  message: string,
  board: BoardData
): Promise<{ response: string; board: BoardData | null }> {
  const res = await fetch(`/api/boards/${boardId}/ai/chat`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ message, board }),
  });
  return handleResponse<{ response: string; board: BoardData | null }>(res);
}
