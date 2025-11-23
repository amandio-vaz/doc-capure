// api/_lib/gemini.ts
// Cliente Gemini compartilhado para uso nos endpoints da API
import { GoogleGenAI } from "@google/genai";

// Valida que a API key existe (fail fast)
const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  throw new Error("GEMINI_API_KEY não está configurada nas variáveis de ambiente");
}

// Singleton do cliente Gemini
export const geminiClient = new GoogleGenAI({ apiKey: API_KEY });

// Helper para validar origem da requisição (CORS)
export function validateOrigin(req: any): boolean {
  const origin = req.headers.origin || req.headers.referer;

  // Em desenvolvimento, permite localhost
  if (process.env.NODE_ENV === 'development') {
    return true;
  }

  // Em produção, valida domínio permitido
  const allowedOrigins = [
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '',
    process.env.PRODUCTION_URL || '',
  ].filter(Boolean);

  return allowedOrigins.some(allowed => origin?.startsWith(allowed));
}

// Helper para resposta de erro padronizada
export function errorResponse(message: string, status: number = 500) {
  return {
    status,
    body: JSON.stringify({
      error: message,
      timestamp: new Date().toISOString()
    }),
    headers: { 'Content-Type': 'application/json' }
  };
}

// Helper para resposta de sucesso padronizada
export function successResponse(data: any, status: number = 200) {
  return {
    status,
    body: JSON.stringify(data),
    headers: { 'Content-Type': 'application/json' }
  };
}
