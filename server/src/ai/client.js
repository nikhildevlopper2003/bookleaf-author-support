import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

export class AiUnavailableError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'AiUnavailableError';
    this.cause = cause;
  }
}

// Created lazily so the key is only ever read from the environment, server side.
let client;
const getClient = () => {
  if (!config.ai.apiKey) return null;
  client ??= new Anthropic({
    apiKey: config.ai.apiKey,
    timeout: config.ai.timeoutMs,
    maxRetries: 1,
  });
  return client;
};

export const aiConfigured = () => Boolean(config.ai.apiKey);

/**
 * Single choke point for LLM calls. Any failure (no key, timeout, 429, 5xx, empty reply)
 * surfaces as AiUnavailableError so callers can degrade instead of crashing.
 */
export async function complete({ system, user, maxTokens, temperature = 0.2 }) {
  const c = getClient();
  if (!c) throw new AiUnavailableError('ANTHROPIC_API_KEY is not set');

  try {
    const res = await c.messages.create({
      model: config.ai.model,
      max_tokens: maxTokens,
      temperature,
      system,
      messages: [{ role: 'user', content: user }],
    });
    const text = res.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    if (!text) throw new Error('Empty completion');
    return { text, usage: res.usage };
  } catch (err) {
    throw new AiUnavailableError(`AI request failed: ${err.status ?? ''} ${err.message}`, err);
  }
}
