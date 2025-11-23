// api/generate-plan.ts
// Endpoint seguro para geração de planos de estudo
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { geminiClient, validateOrigin, errorResponse, successResponse } from './_lib/gemini';
import { checkRateLimit, getRateLimitInfo } from './_lib/rateLimit';

// Interface para o corpo da requisição
interface GeneratePlanRequest {
  source: {
    files?: { name: string; content: string }[];
    url?: string;
  };
  studyTopic: string;
  additionalTopics: string;
}

// Interface para a resposta
interface Documentation {
  title: string;
  chapters: Array<{
    title: string;
    content: string;
    subChapters?: any[];
  }>;
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
  if (!checkRateLimit(ip, 'generate-plan')) {
    const info = getRateLimitInfo(ip, 'generate-plan');
    return res.status(429).json({
      error: 'Limite de requisições excedido. Tente novamente mais tarde.',
      resetAt: new Date(info.resetAt).toISOString(),
      limit: info.limit
    });
  }

  try {
    // Valida e extrai dados do corpo
    const { source, studyTopic, additionalTopics } = req.body as GeneratePlanRequest;

    // Validações básicas
    if (!source || !studyTopic?.trim()) {
      return res.status(400).json({
        error: 'Parâmetros inválidos. Forneça source e studyTopic.'
      });
    }

    // Valida que há pelo menos uma fonte
    const hasFiles = source.files && source.files.length > 0;
    const hasUrl = source.url && source.url.trim().length > 0;

    if (!hasFiles && !hasUrl) {
      return res.status(400).json({
        error: 'Forneça pelo menos uma fonte (arquivos ou URL).'
      });
    }

    // Monta o prompt (mesma lógica do geminiService.ts original)
    const sourcePromptPart = source.url
      ? `**Fonte de Estudo Principal (URL):**
O usuário forneceu a seguinte URL como ponto de partida para a documentação: ${source.url}.
Sua tarefa inclui:
1.  **Navegação Profunda:** A partir da URL inicial, navegue pelas páginas vinculadas para explorar toda a seção da documentação. Vá a vários níveis de profundidade.
2.  **Extração Completa:** Extraia o conteúdo completo das páginas, NÃO resuma.
3.  **Estruturação:** Organize o conteúdo extraído em capítulos e subtópicos que reflitam a estrutura da documentação original.`
      : `**Fonte de Estudo Principal (Arquivos do Usuário):**
${source.files?.map(file => `--- INÍCIO DO ARQUIVO: ${file.name} ---\n${file.content}\n--- FIM DO ARQUIVO: ${file.name} ---`).join('\n\n') ?? 'Nenhum arquivo fornecido.'}`;

    const prompt = `Você é o Cortex DeepMind, um assistente de IA especialista em criar planos de estudo personalizados.

**Tarefa:**
Sua missão é gerar um plano de estudo estruturado e detalhado com base no TEMA DE ESTUDO, na fonte de estudo (URL ou arquivos) e nos tópicos adicionais fornecidos pelo usuário. O tema pode ser um código de exame de certificação (ex: AZ-104) ou um tópico para estudo livre (ex: Kubernetes, React).

**Tema de Estudo:** ${studyTopic}

${sourcePromptPart}

${additionalTopics?.trim() ? `**Tópicos Adicionais Solicitados pelo Usuário:**
O usuário solicitou que os seguintes tópicos ou perguntas sejam cobertos com atenção especial no plano de estudo:
${additionalTopics}` : ''}

**Processo:**
1.  **Analisar a Fonte:** Processe a fonte de estudo principal.
    - Se for uma **URL**, atue como um pesquisador web avançado. Navegue pela documentação, extraia o conteúdo completo e estruture-o.
    - Se forem **arquivos**, analise o conteúdo fornecido.
2.  **Identificar o Tema:** Analise o tema "${studyTopic}".
    - Se parecer um código de exame de certificação, identifique o nome completo do exame e seus objetivos oficiais. Utilize a busca na web para isso.
    - Se for um tópico geral, estruture o plano de estudo em torno dos conceitos fundamentais daquela tecnologia.
3.  **Integrar Tópicos Adicionais:** Se houver tópicos extras solicitados, certifique-se de que sejam incorporados de forma proeminente no plano de estudo.
4.  **Estruturar o Plano:** Crie um plano de estudo organizado em "chapters" (tópicos principais). Cada tópico deve corresponder a uma área de habilidade principal do tema.
5.  **Enriquecer o Conteúdo:** Para cada tópico, sintetize as informações da fonte principal. Além disso, use a busca na web para complementar o conteúdo com insights adicionais, explicações cruciais e links para recursos externos confiáveis (documentação oficial, artigos, tutoriais em vídeo).
6.  **Gerar Saída JSON:** Formate o plano de estudo completo em um único objeto JSON.

**Formato de Saída (JSON):**
O JSON final deve seguir esta estrutura. O campo 'content' deve estar em formato Markdown.
{
  "title": "Plano de Estudo para [Nome do Tema de Estudo - e.g., Microsoft Certified: Azure Administrator Associate ou Kubernetes]",
  "chapters": [
    {
      "title": "Tópico Principal 1 (e.g., Gerenciar Identidades e Governança do Azure)",
      "content": "Um texto detalhado em Markdown que cobre este tópico. Inclua resumos do material do usuário, informações adicionais da web, exemplos de código relevantes e links úteis.",
      "subChapters": [
        {
          "title": "Subtópico 1.1 (e.g., Gerenciar objetos do Azure AD)",
          "content": "Conteúdo detalhado para este subtópico em Markdown.",
          "subChapters": []
        }
      ]
    }
  ]
}

**Instruções Críticas:**
- O título principal do JSON ("title") **deve** refletir claramente o tema de estudo. Se for um exame, use o nome oficial. Se for um tópico ou uma documentação web, use o nome apropriado.
- O conteúdo ('content') deve ser rico, informativo e bem formatado em Markdown.
- A sua resposta final deve ser **exclusivamente** o objeto JSON completo. Não inclua texto explicativo, comentários ou blocos de código markdown (\`\`\`) envolvendo o JSON.`;

    // Chama a API do Gemini (agora de forma segura no backend)
    const response = await geminiClient.models.generateContent({
      model: "gemini-2.5-pro",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        maxOutputTokens: 8192,
        thinkingConfig: { thinkingBudget: 16384 },
      },
    });

    const rawText = response.text;

    // Parsing do JSON (mesma lógica original)
    let jsonText = '';
    const markdownMatch = rawText.match(/```(?:json)?\s*(\{[\s\S]+\})\s*```/);

    if (markdownMatch && markdownMatch[1]) {
      jsonText = markdownMatch[1];
    } else {
      const startIndex = rawText.indexOf('{');
      const endIndex = rawText.lastIndexOf('}');

      if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
        console.error("Resposta completa da IA (não-JSON):", rawText);
        return res.status(500).json({
          error: 'A resposta da IA não contém um objeto JSON válido.'
        });
      }
      jsonText = rawText.substring(startIndex, endIndex + 1);
    }

    // Parse e validação
    const docData: Documentation = JSON.parse(jsonText);

    if (!docData.title || !Array.isArray(docData.chapters)) {
      return res.status(500).json({
        error: 'A resposta da IA não está no formato esperado.'
      });
    }

    // Adiciona headers de rate limit na resposta
    const info = getRateLimitInfo(ip, 'generate-plan');
    res.setHeader('X-RateLimit-Limit', info.limit.toString());
    res.setHeader('X-RateLimit-Remaining', info.remaining.toString());
    res.setHeader('X-RateLimit-Reset', new Date(info.resetAt).toISOString());

    // Retorna sucesso
    return res.status(200).json(docData);

  } catch (error) {
    console.error('Erro ao gerar plano de estudo:', error);

    // Tratamento específico de erros
    if (error instanceof SyntaxError) {
      return res.status(500).json({
        error: 'A resposta da IA não era um JSON válido. Tente novamente.'
      });
    }

    if (error instanceof Error) {
      return res.status(500).json({
        error: error.message || 'Erro ao gerar plano de estudo.'
      });
    }

    return res.status(500).json({
      error: 'Não foi possível gerar o plano de estudo. Tente novamente mais tarde.'
    });
  }
}
