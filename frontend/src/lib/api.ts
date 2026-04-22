import type { BoardData } from "./kanban";

let authToken: string | null = null;

export function setAuthToken(token: string) {
  authToken = token;
}

export function clearAuthToken() {
  authToken = null;
}

export function getAuthToken(): string | null {
  return authToken;
}

function authHeaders(): Record<string, string> {
  return authToken ? { Authorization: `Bearer ${authToken}` } : {};
}

function jsonHeaders(): Record<string, string> {
  return { "Content-Type": "application/json", ...authHeaders() };
}

async function handle<T>(res: Response): Promise<T> {
  if (res.status === 401) throw new AuthError("Unauthorized");
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.detail) {
        detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
      }
    } catch {
      // Body wasn't JSON; keep the generic message.
    }
    throw new ApiError(detail, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export class AuthError extends ApiError {
  constructor(message: string) {
    super(message, 401);
  }
}

// Types ----------------------------------------------------------------

export interface UserProfile {
  id: string;
  username: string;
  email: string | null;
  display_name: string;
}

export interface AuthResponse {
  token: string;
  user: UserProfile;
}

export type CollaboratorRole = "viewer" | "editor";
export type BoardRole = "owner" | CollaboratorRole;

export interface BoardSummary {
  id: string;
  name: string;
  description: string;
  color: string;
  is_archived: boolean;
  position: number;
  card_count: number;
  column_count: number;
  created_at: string;
  updated_at: string;
  role: BoardRole;
  owner_id: string;
  owner_username: string;
  owner_display_name: string;
  is_shared: boolean;
}

export interface CollaboratorEntry {
  user_id: string;
  username: string;
  display_name: string;
  role: BoardRole;
  is_owner: boolean;
  added_at: string | null;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  response_text: string;
  board_update: BoardData | null;
}

// Auth ----------------------------------------------------------------

export async function registerApi(params: {
  username: string;
  password: string;
  email?: string;
  display_name?: string;
}): Promise<AuthResponse> {
  const res = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return handle<AuthResponse>(res);
}

export async function loginApi(username: string, password: string): Promise<AuthResponse> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return handle<AuthResponse>(res);
}

export async function logoutApi(): Promise<void> {
  if (!_token) return;
  await fetch("/api/auth/logout", {
    method: "POST",
    headers: authHeaders(),
  });
}

export async function meApi(): Promise<UserProfile> {
  const res = await fetch("/api/auth/me", { headers: authHeaders() });
  return handle<UserProfile>(res);
}

export async function updateProfileApi(params: {
  display_name?: string;
  email?: string | null;
  current_password?: string;
  new_password?: string;
}): Promise<UserProfile> {
  const res = await fetch("/api/auth/me", {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify(params),
  });
  return handle<UserProfile>(res);
}

// Boards --------------------------------------------------------------

export async function listBoards(includeArchived = false): Promise<BoardSummary[]> {
  const url = `/api/boards${includeArchived ? "?include_archived=true" : ""}`;
  const res = await fetch(url, { headers: authHeaders() });
  return handle<BoardSummary[]>(res);
}

export async function createBoardApi(params: {
  name: string;
  description?: string;
  color?: string;
}): Promise<BoardSummary> {
  const res = await fetch("/api/boards", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(params),
  });
  return handle<BoardSummary>(res);
}

export async function patchBoardApi(
  boardId: string,
  params: Partial<{
    name: string;
    description: string;
    color: string;
    is_archived: boolean;
    position: number;
  }>
): Promise<BoardSummary> {
  const res = await fetch(`/api/boards/${boardId}`, {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify(params),
  });
  return handle<BoardSummary>(res);
}

export async function deleteBoardApi(boardId: string): Promise<void> {
  const res = await fetch(`/api/boards/${boardId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  await handle<void>(res);
}

export async function getBoard(boardId: string): Promise<BoardData> {
  const res = await fetch(`/api/boards/${boardId}`, { headers: authHeaders() });
  return handle<BoardData>(res);
}

export async function updateBoard(boardId: string, board: BoardData): Promise<void> {
  const res = await fetch(`/api/boards/${boardId}`, {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify(board),
  });
  await handle<void>(res);
}

export interface BoardExportPayload {
  version: number;
  name: string;
  description: string;
  color: string;
  data: BoardData;
  comments: Array<{
    card_id: string;
    body: string;
    username: string | null;
    display_name: string | null;
    created_at: string;
    updated_at: string;
  }>;
  exported_at: string | null;
}

export async function exportBoardApi(boardId: string): Promise<BoardExportPayload> {
  const res = await fetch(`/api/boards/${boardId}/export`, {
    headers: authHeaders(),
  });
  return handle<BoardExportPayload>(res);
}

export async function importBoardApi(
  payload: unknown
): Promise<BoardSummary> {
  const res = await fetch("/api/boards/import", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  return handle<BoardSummary>(res);
}

// Collaborators -------------------------------------------------------

export async function listCollaboratorsApi(boardId: string): Promise<CollaboratorEntry[]> {
  const res = await fetch(`/api/boards/${boardId}/collaborators`, { headers: authHeaders() });
  return handle<CollaboratorEntry[]>(res);
}

export async function addCollaboratorApi(
  boardId: string,
  username: string,
  role: CollaboratorRole
): Promise<CollaboratorEntry> {
  const res = await fetch(`/api/boards/${boardId}/collaborators`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ username, role }),
  });
  return handle<CollaboratorEntry>(res);
}

export async function updateCollaboratorRoleApi(
  boardId: string,
  userId: string,
  role: CollaboratorRole
): Promise<CollaboratorEntry> {
  const res = await fetch(`/api/boards/${boardId}/collaborators/${userId}`, {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify({ role }),
  });
  return handle<CollaboratorEntry>(res);
}

export async function removeCollaboratorApi(
  boardId: string,
  userId: string
): Promise<void> {
  const res = await fetch(`/api/boards/${boardId}/collaborators/${userId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  await handle<void>(res);
}

// Activity ------------------------------------------------------------

export interface ActivityEntry {
  id: string;
  action: string;
  meta: Record<string, unknown>;
  user_id: string;
  user_display_name: string | null;
  username: string | null;
  created_at: string;
}

export async function listBoardActivity(
  boardId: string,
  opts: { limit?: number; before?: string; kinds?: string[] } = {}
): Promise<ActivityEntry[]> {
  const params = new URLSearchParams();
  if (opts.limit) params.set("limit", String(opts.limit));
  if (opts.before) params.set("before", opts.before);
  if (opts.kinds?.length) params.set("kinds", opts.kinds.join(","));
  const query = params.toString();
  const res = await fetch(
    `/api/boards/${boardId}/activity${query ? `?${query}` : ""}`,
    { headers: authHeaders() }
  );
  return handle<ActivityEntry[]>(res);
}

// Card comments ------------------------------------------------------

export interface CardCommentEntry {
  id: string;
  board_id: string;
  card_id: string;
  user_id: string;
  username: string | null;
  user_display_name: string | null;
  body: string;
  created_at: string;
  updated_at: string;
  edited: boolean;
}

function commentsBase(boardId: string, cardId: string) {
  return `/api/boards/${boardId}/cards/${cardId}/comments`;
}

export async function listCardCommentsApi(
  boardId: string,
  cardId: string
): Promise<CardCommentEntry[]> {
  const res = await fetch(commentsBase(boardId, cardId), {
    headers: authHeaders(),
  });
  return handle<CardCommentEntry[]>(res);
}

export async function addCardCommentApi(
  boardId: string,
  cardId: string,
  body: string
): Promise<CardCommentEntry> {
  const res = await fetch(commentsBase(boardId, cardId), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ body }),
  });
  return handle<CardCommentEntry>(res);
}

export async function updateCardCommentApi(
  boardId: string,
  cardId: string,
  commentId: string,
  body: string
): Promise<CardCommentEntry> {
  const res = await fetch(`${commentsBase(boardId, cardId)}/${commentId}`, {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify({ body }),
  });
  return handle<CardCommentEntry>(res);
}

export async function deleteCardCommentApi(
  boardId: string,
  cardId: string,
  commentId: string
): Promise<void> {
  const res = await fetch(`${commentsBase(boardId, cardId)}/${commentId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  await handle<void>(res);
}

// Notifications -------------------------------------------------------

export interface NotificationEntry {
  id: string;
  kind: string;
  board_id: string | null;
  board_name: string | null;
  card_id: string | null;
  comment_id: string | null;
  actor_id: string | null;
  actor_username: string | null;
  actor_display_name: string | null;
  meta: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

export async function listNotificationsApi(
  opts: { unread_only?: boolean; limit?: number } = {}
): Promise<NotificationEntry[]> {
  const params = new URLSearchParams();
  if (opts.unread_only) params.set("unread_only", "true");
  if (opts.limit) params.set("limit", String(opts.limit));
  const query = params.toString();
  const res = await fetch(`/api/notifications${query ? `?${query}` : ""}`, {
    headers: authHeaders(),
  });
  return handle<NotificationEntry[]>(res);
}

export async function markNotificationReadApi(id: string): Promise<void> {
  const res = await fetch(`/api/notifications/${id}/read`, {
    method: "POST",
    headers: authHeaders(),
  });
  await handle<void>(res);
}

export async function markAllNotificationsReadApi(): Promise<void> {
  const res = await fetch(`/api/notifications/read-all`, {
    method: "POST",
    headers: authHeaders(),
  });
  await handle<void>(res);
}

// Dashboard -----------------------------------------------------------

export interface DashboardBoardSummary {
  board_id: string;
  name: string;
  color: string;
  role: BoardRole;
  is_shared: boolean;
  card_count: number;
  overdue_count: number;
  due_soon_count: number;
}

export interface DashboardCardSummary {
  card_id: string;
  title: string;
  priority: string | null;
  due_date: string | null;
  labels: string[];
  board_id: string;
  board_name: string;
  board_color: string;
  column_title: string;
  overdue: boolean;
}

export interface DashboardSummary {
  total_boards: number;
  total_cards: number;
  overdue_count: number;
  due_soon_count: number;
}

export interface DashboardResponse {
  summary: DashboardSummary;
  boards: DashboardBoardSummary[];
  upcoming: DashboardCardSummary[];
}

export async function getDashboardApi(): Promise<DashboardResponse> {
  const res = await fetch(`/api/dashboard`, { headers: authHeaders() });
  return handle<DashboardResponse>(res);
}

// AI ------------------------------------------------------------------

export async function chatAi(
  boardId: string,
  question: string,
  kanban: BoardData,
  history: ChatMessage[]
): Promise<ChatResponse> {
  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ board_id: boardId, question, kanban, history }),
  });
  return handle<ChatResponse>(res);
}
