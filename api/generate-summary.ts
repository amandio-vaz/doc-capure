// api/generate-summary.ts
// Endpoint seguro para geração de resumos de capítulos
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { geminiClient, validateOrigin } from './_lib/gemini';
import { checkRateLimit, getRateLimitInfo } from './_lib/rateLimit';

interface GenerateSummaryRequest {
  chapterTitle: string;
  chapterContent: string;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Apenas POST é permitido
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  // Valida origem (CORS básico)
  if (!validateOrigin(req)) {
    return res.status(403).json({ error: 'Origem não autorizada' });
  }

  // Extrai IP para rate limiting
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
             req.socket.remoteAddress ||
             'unknown';

  // Aplica rate limiting
  if (!checkRateLimit(ip, 'generate-summary')) {
    const info = getRateLimitInfo(ip, 'generate-summary');
    return res.status(429).json({
      error: 'Limite de requisições excedido. Tente novamente mais tarde.',
      resetAt: new Date(info.resetAt).toISOString(),
      limit: info.limit
    });
  }

  try {
    const { chapterTitle, chapterContent } = req.body as GenerateSummaryRequest;

    // Validações
    if (!chapterTitle?.trim() || !chapterContent?.trim()) {
      return res.status(400).json({
        error: 'Os parâmetros "chapterTitle" e "chapterContent" são obrigatórios.'
      });
    }

    // Limite de tamanho do conteúdo
    if (chapterContent.length > 100000) {
      return res.status(400).json({
        error: 'Conteúdo muito longo. Máximo de 100.000 caracteres.'
      });
    }

    // Monta o prompt
    const prompt = `Você é um assistente de IA especialista em resumir textos técnicos.
Sua tarefa é criar um resumo conciso e informativo do tópico de um plano de estudo.

**Título do Tópico:** "${chapterTitle}"

**Conteúdo do Tópico:**
---
${chapterContent}
---

**Instruções:**
1.  Foque nos pontos-chave, conceitos principais e informações essenciais.
2.  Ignore detalhes triviais ou exemplos de código excessivamente longos.
3.  O resumo deve ser claro, coeso e de fácil compreensão.
4.  Retorne o resumo em formato Markdown.

Responda exclusivamente com o resumo em Markdown.`;

    // Chama a API do Gemini
    const response = await geminiClient.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        maxOutputTokens: 1024,
        thinkingConfig: { thinkingBudget: 512 },
      },
    });

    const summary = response.text.trim();

    if (!summary) {
      return res.status(500).json({
        error: 'A resposta da IA estava vazia.'
      });
    }

    // Adiciona headers de rate limit
    const info = getRateLimitInfo(ip, 'generate-summary');
    res.setHeader('X-RateLimit-Limit', info.limit.toString());
    res.setHeader('X-RateLimit-Remaining', info.remaining.toString());
    res.setHeader('X-RateLimit-Reset', new Date(info.resetAt).toISOString());

    // Retorna resumo
    return res.status(200).json({
      summary: summary,
      chapterTitle: chapterTitle
    });

  } catch (error) {
    console.error('Erro ao gerar resumo:', error);

    if (error instanceof Error) {
      return res.status(500).json({
        error: error.message || 'Não foi possível gerar o resumo para este tópico.'
      });
    }

    return res.status(500).json({
      error: 'Não foi possível gerar o resumo. Tente novamente mais tarde.'
    });
  }
}
