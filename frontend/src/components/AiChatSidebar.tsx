"use client";

import { useRef, useState } from "react";
import type { BoardData } from "@/lib/kanban";
import { AuthError, chatAi, type ChatMessage } from "@/lib/api";

interface AiChatSidebarProps {
  boardId: string;
  board: BoardData;
  onBoardUpdate: (board: BoardData) => void;
  onAuthLost: () => void;
}

export const AiChatSidebar = ({
  boardId,
  board,
  onBoardUpdate,
  onAuthLost,
}: AiChatSidebarProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  const handleSend = async () => {
    const question = input.trim();
    if (!question || loading) return;

    const userMsg: ChatMessage = { role: "user", content: question };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    scrollToBottom();

    try {
      const res = await chatAi(boardId, question, board, nextMessages.slice(0, -1));
      setMessages([...nextMessages, { role: "assistant", content: res.response_text }]);
      if (res.board_update) onBoardUpdate(res.board_update);
    } catch (err) {
      if (err instanceof AuthError) {
        onAuthLost();
        return;
      }
      setMessages([
        ...nextMessages,
        { role: "assistant", content: "Sorry, something went wrong. Please try again." },
      ]);
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--stroke)] px-5 py-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--navy-dark)]">
          AI Assistant
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-[var(--gray-text)] text-center mt-8">
            Ask the AI to create, move, edit, or delete cards on your board.
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`rounded-xl px-4 py-3 text-sm leading-relaxed ${
              msg.role === "user"
                ? "ml-6 bg-[var(--secondary-purple)] text-white"
                : "mr-6 bg-[var(--surface)] text-[var(--navy-dark)] border border-[var(--stroke)]"
            }`}
          >
            <p className="whitespace-pre-wrap">{msg.content}</p>
          </div>
        ))}
        {loading && (
          <div className="mr-6 rounded-xl bg-[var(--surface)] border border-[var(--stroke)] px-4 py-3 text-sm text-[var(--gray-text)]">
            Thinking...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-[var(--stroke)] p-4">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask the AI..."
            rows={1}
            className="flex-1 resize-none rounded-xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm text-[var(--navy-dark)] placeholder:text-[var(--gray-text)] focus:border-[var(--primary-blue)] focus:outline-none"
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="rounded-xl bg-[var(--secondary-purple)] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#5e2d75] disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};
