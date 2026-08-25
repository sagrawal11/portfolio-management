import Anthropic from '@anthropic-ai/sdk';

// Daily-brief narrative via the official Anthropic SDK. Defaults to the
// cost-efficient claude-haiku-4-5 since this runs every trading day and is
// grounded summarization; override with BRIEF_MODEL (e.g. claude-sonnet-4-6)
// for deeper analysis. Returns null if no ANTHROPIC_API_KEY is configured, so
// the brief degrades gracefully to facts + headlines only.
export function narrativeEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function writeNarrative(system: string, user: string): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const model = process.env.BRIEF_MODEL || 'claude-haiku-4-5';
  try {
    const client = new Anthropic();
    const msg = await client.messages.create({
      model,
      max_tokens: 1200,
      system,
      messages: [{ role: 'user', content: user }],
    });
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    return text || null;
  } catch (e) {
    // Don't let an AI hiccup break the brief; surface a short note instead.
    return `(AI narrative unavailable: ${(e as Error).message})`;
  }
}
