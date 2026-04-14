import type { BoardData } from "./kanban";

let _authCreds: string | null = null;

export function setAuthCredentials(creds: string) {
  _authCreds = creds;
}

export function clearAuthCredentials() {
  _authCreds = null;
}

function authHeaders(): Record<string, string> {
  if (!_authCreds) return {};
  return { Authorization: `Basic ${_authCreds}` };
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  response_text: string;
  board_update: BoardData | null;
}

export async function loginApi(
  username: string,
  password: string
): Promise<{ id: string; username: string }> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${username}:${password}`),
    },
  });
  if (res.status === 401) {
    throw new Error("Invalid credentials");
  }
  if (!res.ok) {
    throw new Error(`Server error (${res.status})`);
  }
  return res.json();
}

export async function getBoard(userId: string): Promise<BoardData> {
  const res = await fetch(`/api/boards/${userId}`, {
    headers: authHeaders(),
  });
  if (res.status === 401) {
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    throw new Error(`Failed to load board (${res.status})`);
  }
  return res.json();
}

export async function updateBoard(
  userId: string,
  board: BoardData
): Promise<void> {
  const res = await fetch(`/api/boards/${userId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(board),
  });
  if (res.status === 401) {
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    throw new Error(`Failed to save board (${res.status})`);
  }
}

export async function chatAi(
  userId: string,
  question: string,
  kanban: BoardData,
  history: ChatMessage[]
): Promise<ChatResponse> {
  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ user_id: userId, question, kanban, history }),
  });
  if (res.status === 401) {
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    throw new Error(`AI service error (${res.status})`);
  }
  return res.json();
}
