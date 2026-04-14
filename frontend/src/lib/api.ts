import type { BoardData } from "./kanban";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  response_text: string;
  board_update: BoardData | null;
}

export async function chatAi(
  userId: string,
  question: string,
  kanban: BoardData,
  history: ChatMessage[]
): Promise<ChatResponse> {
  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, question, kanban, history }),
  });
  if (!res.ok) {
    throw new Error("AI request failed");
  }
  return res.json();
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
  if (!res.ok) {
    throw new Error("Invalid credentials");
  }
  return res.json();
}

export async function getBoard(userId: string): Promise<BoardData> {
  const res = await fetch(`/api/boards/${userId}`);
  if (!res.ok) {
    throw new Error("Failed to load board");
  }
  return res.json();
}

export async function updateBoard(
  userId: string,
  board: BoardData
): Promise<void> {
  const res = await fetch(`/api/boards/${userId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(board),
  });
  if (!res.ok) {
    throw new Error("Failed to save board");
  }
}
