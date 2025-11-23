// api/_lib/rateLimit.ts
// Sistema simples de rate limiting baseado em memória
// Para produção robusta, considere usar Redis ou Upstash

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// Store em memória (resetado a cada cold start da função)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Configurações de rate limit
const RATE_LIMITS = {
  // Plano de estudo: 10 requisições por hora (caro)
  'generate-plan': { max: 10, windowMs: 60 * 60 * 1000 },

  // Resumo: 30 requisições por hora
  'generate-summary': { max: 30, windowMs: 60 * 60 * 1000 },

  // TTS: 100 requisições por hora
  'generate-speech': { max: 100, windowMs: 60 * 60 * 1000 },
};

export type RateLimitKey = keyof typeof RATE_LIMITS;

/**
 * Verifica se o IP atingiu o limite de rate
 * @param ip Endereço IP do cliente
 * @param endpoint Nome do endpoint
 * @returns true se permitido, false se bloqueado
 */
export function checkRateLimit(ip: string, endpoint: RateLimitKey): boolean {
  const now = Date.now();
  const config = RATE_LIMITS[endpoint];
  const key = `${ip}:${endpoint}`;

  // Limpa entradas expiradas periodicamente (simple garbage collection)
  if (Math.random() < 0.1) {
    cleanExpiredEntries();
  }

  const entry = rateLimitStore.get(key);

  // Primeira requisição ou janela expirada
  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + config.windowMs
    });
    return true;
  }

  // Incrementa contador
  entry.count++;

  // Verifica se excedeu o limite
  if (entry.count > config.max) {
    return false;
  }

  return true;
}

/**
 * Retorna informações sobre o rate limit atual
 */
export function getRateLimitInfo(ip: string, endpoint: RateLimitKey) {
  const key = `${ip}:${endpoint}`;
  const entry = rateLimitStore.get(key);
  const config = RATE_LIMITS[endpoint];
  const now = Date.now();

  if (!entry || now > entry.resetAt) {
    return {
      limit: config.max,
      remaining: config.max,
      resetAt: now + config.windowMs
    };
  }

  return {
    limit: config.max,
    remaining: Math.max(0, config.max - entry.count),
    resetAt: entry.resetAt
  };
}

/**
 * Remove entradas expiradas do store
 */
function cleanExpiredEntries() {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}
