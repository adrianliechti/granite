// TanStack AI adapter for the local OpenAI-compatible proxy
import { openaiCompatibleText } from '@tanstack/ai-openai/compatible';
import { getConfig } from '../config';

/**
 * Create a chat adapter pointing to our local OpenAI-compatible proxy.
 * Uses the chat-completions API, which the proxy speaks.
 */
export function createChatAdapter(model: string) {
  return openaiCompatibleText(model, {
    baseURL: `${window.location.origin}/openai/v1`,
    apiKey: 'not-needed',
    dangerouslyAllowBrowser: true,
  });
}

/**
 * Get the configured model from app config
 */
export function getConfiguredModel(): string {
  return getConfig().ai?.model || 'gpt-5.1';
}
