import { GoogleGenAI, Modality } from "@google/genai";
import { Documentation } from '../types';

const API_KEY = process.env.API_KEY;
if (!API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

export async function generateStudyPlan(
    source: { files?: { name: string; content: string }[]; url?: string },
    studyTopic: string,
    additionalTopics: string
): Promise<Documentation> {
    let jsonText = ''; // Definido aqui para ser acessível no bloco catch
    try {
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

${additionalTopics.trim() ? `**Tópicos Adicionais Solicitados pelo Usuário:**
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

        const response = await ai.models.generateContent({
            model: "gemini-2.5-pro",
            contents: prompt,
            config: {
                tools: [{ googleSearch: {} }],
                // Define um limite máximo de tokens para a resposta, ajudando a controlar custos e garantir que a saída não seja excessivamente longa.
                maxOutputTokens: 8192,
                // Aloca um orçamento de tokens para o "pensamento" do modelo, permitindo um raciocínio mais complexo para tarefas como pesquisa e estruturação de conteúdo.
                thinkingConfig: { thinkingBudget: 16384 },
            },
        });
        
        const rawText = response.text;
        
        const markdownMatch = rawText.match(/```(?:json)?\s*(\{[\s\S]+\})\s*```/);

        if (markdownMatch && markdownMatch[1]) {
            jsonText = markdownMatch[1];
        } else {
            const startIndex = rawText.indexOf('{');
            const endIndex = rawText.lastIndexOf('}');

            if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
                console.error("Resposta completa da IA (não-JSON):", rawText);
                throw new Error("A resposta da IA não contém um objeto JSON válido.");
            }
            jsonText = rawText.substring(startIndex, endIndex + 1);
        }
        
        const docData = JSON.parse(jsonText);

        if (!docData.title || !Array.isArray(docData.chapters)) {
          throw new Error("A resposta da IA não está no formato esperado.");
        }

        return docData;
    } catch (error) {
        console.error("Erro ao gerar plano de estudo:", error);
        if (error instanceof SyntaxError) {
            console.error("Texto JSON que falhou na análise:", jsonText);
            throw new Error("A resposta da IA não era um JSON válido. Tente novamente.");
        }
        if (error instanceof Error && (error.message.includes("JSON válido") || error.message.includes("formato esperado"))) {
             throw error;
        }
        throw new Error("Não foi possível gerar o plano de estudo. Verifique os dados ou tente novamente mais tarde.");
    }
}


export async function generateSpeech(text: string, voice: string): Promise<string> {
    try {
        if (!text || text.trim().length === 0) {
            throw new Error("O texto para gerar áudio não pode estar vazio.");
        }
        const response = await ai.models.generateContent({
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
            throw new Error("A resposta da IA não continha dados de áudio.");
        }
        return base64Audio;
    } catch (error) {
        console.error("Erro ao gerar áudio:", error);
        throw new Error("Não foi possível gerar o áudio para este capítulo.");
    }
}

export async function generateChapterSummary(chapterTitle: string, chapterContent: string): Promise<string> {
    try {
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

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                // Garante que o resumo seja conciso, limitando o número de tokens na saída.
                maxOutputTokens: 1024,
                // O 'thinkingBudget' reserva uma parte dos tokens para o processamento interno,
                // deixando o restante (maxOutputTokens - thinkingBudget) para o texto final do resumo.
                thinkingConfig: { thinkingBudget: 512 },
            },
        });
        
        return response.text.trim();

    } catch (error) {
        console.error("Erro ao gerar resumo do tópico:", error);
        throw new Error("Não foi possível gerar o resumo para este tópico. Tente novamente.");
    }
}