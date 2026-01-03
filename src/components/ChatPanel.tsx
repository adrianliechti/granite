import { useRef, useEffect, useState, useMemo } from 'react';
import { Send, X, Trash2, Square, Loader2, Sparkles } from 'lucide-react';
import { useChat, stream, type UIMessage } from '@tanstack/ai-react';
import { chat, maxIterations } from '@tanstack/ai';
import { createChatAdapter, getConfiguredModel } from '../api/chatAdapter';
import { createQueryTools, buildQueryInstructions, queryAdapterConfig } from '../api/queryTools';
import type { QueryChatEnvironment, QuerySetters } from '../types/chat';
import type { Connection, SQLResponse } from '../types';
import type { SchemaInfo } from './QueryEditor';
import { Markdown } from './Markdown';

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  connection: Connection | null;
  database: string | null;
  table: string | null;
  currentQuery: string;
  queryResult: SQLResponse | null;
  schema: SchemaInfo | undefined;
  setters: QuerySetters;
}

export function ChatPanel({ 
  isOpen, 
  onClose, 
  connection,
  database,
  table,
  currentQuery,
  queryResult,
  schema,
  setters,
}: ChatPanelProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  
  // Track connection ID changes to reset chat
  const prevConnectionIdRef = useRef(connection?.id);

  // Create environment for tools
  const environment: QueryChatEnvironment = useMemo(() => ({
    connection,
    database,
    table,
    currentQuery,
    queryResult,
    schema,
    setters,
  }), [connection, database, table, currentQuery, queryResult, schema, setters]);

  // Create tools
  const tools = useMemo(() => createQueryTools(environment), [environment]);

  // Build instructions with current environment
  const instructions = useMemo(() => buildQueryInstructions(environment), [environment]);

  // Create connection adapter that wraps the chat() function
  const chatConnection = useMemo(() => {
    const model = getConfiguredModel();
    const adapter = createChatAdapter(model);

    return stream((messages) => 
      chat({
        adapter,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        messages: messages as any,
        tools,
        systemPrompts: [instructions],
        agentLoopStrategy: maxIterations(10),
      })
    );
  }, [tools, instructions]);

  const { messages, sendMessage, isLoading, stop, clear } = useChat({
    connection: chatConnection,
    tools,
  });

  // Reset chat when connection ID changes
  useEffect(() => {
    if (prevConnectionIdRef.current !== connection?.id) {
      clear();
      prevConnectionIdRef.current = connection?.id;
    }
  }, [connection?.id, clear]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage(input.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // Extract text content from message parts
  const getMessageContent = (message: UIMessage): string => {
    return message.parts
      .filter((part): part is { type: 'text'; content: string } => 
        part.type === 'text' && Boolean(part.content)
      )
      .map(part => part.content)
      .join('')
      .replace(/^undefined/, ''); // Remove "undefined" prefix from library bug
  };

  // Check if message is currently streaming (last assistant message while loading)
  const isStreaming = (message: UIMessage, index: number): boolean => {
    return isLoading && 
           message.role === 'assistant' && 
           index === messages.length - 1;
  };

  if (!isOpen) return null;

  return (
    <div className="w-96 shrink-0 bg-white border border-neutral-200 dark:bg-neutral-900 dark:border-neutral-800 flex flex-col rounded-xl overflow-hidden">
      {/* Header */}
      <div className="shrink-0 h-12 px-4 flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-amber-500" />
          <h3 className="font-medium text-neutral-900 dark:text-neutral-100">{queryAdapterConfig.name}</h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={clear}
            className="p-1.5 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 dark:hover:text-neutral-300 dark:hover:bg-neutral-800 rounded transition-colors"
            title="Clear chat"
          >
            <Trash2 size={16} />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 dark:hover:text-neutral-300 dark:hover:bg-neutral-800 rounded transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {messages.length === 0 && (
          <div className="text-center text-neutral-500 dark:text-neutral-400 text-sm py-8">
            <Sparkles size={24} className="mx-auto mb-3 text-amber-500/50" />
            <p className="mb-2">Ask me to help with your SQL queries</p>
            <p className="text-xs text-neutral-400 dark:text-neutral-500">
              Examples: "Write a query to find all users created this month" or "What's wrong with my query?"
            </p>
          </div>
        )}
        {messages.map((message, index) => {
          const content = getMessageContent(message);
          
          return (
            <div key={message.id} className="space-y-3">
              {/* Message content */}
              {(content || isStreaming(message, index)) && (
                <div
                  className={`text-sm ${
                    message.role === 'user'
                      ? 'bg-neutral-100 dark:bg-neutral-800 rounded-lg px-3 py-2'
                      : ''
                  }`}
                >
                  <div className={message.role === 'user' ? 'text-neutral-900 dark:text-neutral-100' : 'text-neutral-700 dark:text-neutral-300'}>
                    {message.role === 'assistant' ? (
                      content ? (
                        <Markdown>{content}</Markdown>
                      ) : isStreaming(message, index) ? (
                        <span className="flex items-center gap-2 text-neutral-400">
                          <Loader2 size={14} className="animate-spin" />
                          Thinking...
                        </span>
                      ) : null
                    ) : (
                      <span className="whitespace-pre-wrap">{content}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        
        {/* Loading indicator when no assistant message yet */}
        {isLoading && (messages.length === 0 || messages[messages.length - 1]?.role === 'user') && (
          <div className="text-sm">
            <div className="text-neutral-800 dark:text-neutral-200">
              <span className="flex items-center gap-2 text-neutral-400">
                <Loader2 size={14} className="animate-spin" />
                Thinking...
              </span>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="shrink-0 p-3 border-t border-neutral-200 dark:border-neutral-800">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={queryAdapterConfig.placeholder}
            rows={1}
            disabled={isLoading}
            className="flex-1 px-3 py-2 bg-neutral-50 border border-neutral-200 dark:bg-neutral-800 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 text-sm placeholder-neutral-400 resize-none focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 disabled:opacity-50"
            style={{ maxHeight: '120px' }}
          />
          <button
            type={isLoading ? 'button' : 'submit'}
            onClick={isLoading ? stop : undefined}
            disabled={!isLoading && !input.trim()}
            className="p-2 bg-amber-500 hover:bg-amber-400 disabled:bg-neutral-300 dark:disabled:bg-neutral-700 disabled:text-neutral-500 text-white rounded-lg transition-colors"
          >
            {isLoading ? <Square size={16} /> : <Send size={16} />}
          </button>
        </div>
      </form>
    </div>
  );
}
