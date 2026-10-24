import { config } from './config.js';
import { seed } from './db/seed.js';
import { createApp } from './app.js';
import { aiConfigured } from './ai/client.js';

seed();

createApp().listen(config.port, () => {
  console.log(`API listening on :${config.port}`);
  if (!aiConfigured()) {
    console.warn('ANTHROPIC_API_KEY not set: using rule-based triage, AI drafts disabled');
  }
});
