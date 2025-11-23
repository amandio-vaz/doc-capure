// api/generate-speech.ts
// Endpoint seguro para geração de áudio (Text-to-Speech)
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { geminiClient, validateOrigin } from './_lib/gemini';
import { checkRateLimit, getRateLimitInfo } from './_lib/rateLimit';
import { Modality } from '@google/genai';

// Vozes disponíveis
const AVAILABLE_VOICES = ['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr'];

interface GenerateSpeechRequest {
  text: string;
  voice: string;
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
  if (!checkRateLimit(ip, 'generate-speech')) {
    const info = getRateLimitInfo(ip, 'generate-speech');
    return res.status(429).json({
      error: 'Limite de requisições excedido. Tente novamente mais tarde.',
      resetAt: new Date(info.resetAt).toISOString(),
      limit: info.limit
    });
  }

  try {
    const { text, voice } = req.body as GenerateSpeechRequest;

    // Validações
    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        error: 'O parâmetro "text" é obrigatório e não pode estar vazio.'
      });
    }

    if (!voice || !AVAILABLE_VOICES.includes(voice)) {
      return res.status(400).json({
        error: `Voz inválida. Use uma das vozes disponíveis: ${AVAILABLE_VOICES.join(', ')}`
      });
    }

    // Limite de tamanho do texto (evita requisições muito grandes)
    if (text.length > 50000) {
      return res.status(400).json({
        error: 'Texto muito longo. Máximo de 50.000 caracteres.'
      });
    }

    // Chama a API do Gemini TTS
    const response = await geminiClient.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!base64Audio) {
      return res.status(500).json({
        error: 'A resposta da IA não continha dados de áudio.'
      });
    }

    // Adiciona headers de rate limit
    const info = getRateLimitInfo(ip, 'generate-speech');
    res.setHeader('X-RateLimit-Limit', info.limit.toString());
    res.setHeader('X-RateLimit-Remaining', info.remaining.toString());
    res.setHeader('X-RateLimit-Reset', new Date(info.resetAt).toISOString());

    // Retorna áudio em base64
    return res.status(200).json({
      audioData: base64Audio,
      voice: voice
    });

  } catch (error) {
    console.error('Erro ao gerar áudio:', error);

    if (error instanceof Error) {
      return res.status(500).json({
        error: error.message || 'Não foi possível gerar o áudio para este texto.'
      });
    }

    return res.status(500).json({
      error: 'Não foi possível gerar o áudio. Tente novamente mais tarde.'
    });
  }
}
