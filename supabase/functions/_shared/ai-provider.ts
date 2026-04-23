export type AIProviderType = 'gemini' | 'openai' | 'anthropic';

export interface AIResponse {
  content: string;
  error?: string;
  status: 'success' | 'invalid_key' | 'rate_limit' | 'error';
}

export interface AIService {
  generateText(prompt: string, apiKey: string): Promise<AIResponse>;
}

// --- PROVIDER ADAPTERS ---

class GeminiAdapter implements AIService {
  async generateText(prompt: string, apiKey: string): Promise<AIResponse> {
    try {
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      
      const data = await resp.json();
      if (resp.status === 400 || resp.status === 401) return { content: '', status: 'invalid_key', error: data.error?.message };
      if (resp.status === 429) return { content: '', status: 'rate_limit' };
      
      return { content: data.candidates?.[0]?.content?.parts?.[0]?.text || '', status: 'success' };
    } catch (e) {
      return { content: '', status: 'error', error: e.message };
    }
  }
}

class OpenAIAdapter implements AIService {
  async generateText(prompt: string, apiKey: string): Promise<AIResponse> {
    try {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }]
        })
      });
      
      const data = await resp.json();
      if (resp.status === 401) return { content: '', status: 'invalid_key' };
      if (resp.status === 429) return { content: '', status: 'rate_limit' };
      
      return { content: data.choices?.[0]?.message?.content || '', status: 'success' };
    } catch (e) {
      return { content: '', status: 'error', error: e.message };
    }
  }
}

class AnthropicAdapter implements AIService {
  async generateText(prompt: string, apiKey: string): Promise<AIResponse> {
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20240620',
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      
      const data = await resp.json();
      if (resp.status === 401) return { content: '', status: 'invalid_key' };
      if (resp.status === 429) return { content: '', status: 'rate_limit' };
      
      return { content: data.content?.[0]?.text || '', status: 'success' };
    } catch (e) {
      return { content: '', status: 'error', error: e.message };
    }
  }
}

// --- FACTORY ---

export const getAIService = (provider: AIProviderType): AIService => {
  switch (provider) {
    case 'gemini': return new GeminiAdapter();
    case 'openai': return new OpenAIAdapter();
    case 'anthropic': return new AnthropicAdapter();
    default: throw new Error(`Unsupported AI provider: ${provider}`);
  }
};

/**
 * getAIProvider
 * Higher-level factory that returns an object with a simplified generateSummary method.
 * Extracted from tenant configuration.
 */
export const getAIProvider = (tenant: any) => {
  const providerType = tenant.ai_provider || 'gemini';
  const apiKey = tenant.ai_api_key;
  
  if (!apiKey) {
    throw new Error(`AI API Key not configured for tenant: ${tenant.name}`);
  }

  const service = getAIService(providerType);

  return {
    generateSummary: async (prompt: string) => {
      const res = await service.generateText(prompt, apiKey);
      if (res.status === 'success') {
        return res.content;
      }
      throw new Error(res.error || `AI Generation failed with status: ${res.status}`);
    }
  };
};
