import { GoogleGenAI, Modality } from "@google/genai";
import { Documentation } from '../types';

const API_KEY = process.env.API_KEY;
if (!API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

export async function generateStudyPlan(filesContent: { name: string; content: string }[], examCode: string, additionalTopics: string): Promise<Documentation> {
    let jsonText = ''; // Definido aqui para ser acessível no bloco catch
    try {
        const prompt = `Você é o Cortex DeepMind, um assistente de IA especialista em criar planos de estudo personalizados para exames de certificação de TI.

**Tarefa:**
Sua missão é gerar um plano de estudo estruturado e detalhado com base no código do exame, no conteúdo dos arquivos e nos tópicos adicionais fornecidos pelo usuário.

**Código do Exame:** ${examCode}

**Contexto (Conteúdo dos Arquivos do Usuário):**
${filesContent.map(file => `--- INÍCIO DO ARQUIVO: ${file.name} ---\n${file.content}\n--- FIM DO ARQUIVO: ${file.name} ---`).join('\n\n')}

${additionalTopics.trim() ? `**Tópicos Adicionais Solicitados pelo Usuário:**
O usuário solicitou que os seguintes tópicos ou perguntas sejam cobertos com atenção especial no plano de estudo:
${additionalTopics}` : ''}

**Processo:**
1.  **Identificar o Exame:** Use o código "${examCode}" para identificar o nome completo do exame e seus objetivos oficiais. Utilize a busca na web para encontrar as informações mais recentes e precisas.
2.  **Analisar o Conteúdo:** Analise o conteúdo dos arquivos fornecidos. Este material é a base de estudo primária do usuário.
3.  **Integrar Tópicos Adicionais:** Se houver tópicos extras solicitados, certifique-se de que sejam incorporados de forma proeminente no plano de estudo, seja como novos capítulos/subcapítulos ou como seções destacadas dentro dos tópicos existentes.
4.  **Estruturar o Plano:** Crie um plano de estudo organizado em "chapters" (tópicos principais). Cada tópico deve corresponder a uma área de habilidade principal do exame.
5.  **Enriquecer o Conteúdo:** Para cada tópico, sintetize as informações relevantes dos arquivos do usuário. Além disso, use a busca na web para complementar o conteúdo com insights adicionais, explicações cruciais e links para recursos externos confiáveis (documentação oficial, artigos, tutoriais em vídeo).
6.  **Gerar Saída JSON:** Formate o plano de estudo completo em um único objeto JSON.

**Formato de Saída (JSON):**
O JSON final deve seguir esta estrutura. O campo 'content' deve estar em formato Markdown.
{
  "title": "Plano de Estudo para [Nome Completo do Exame - e.g., Microsoft Certified: Azure Administrator Associate]",
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
- O título principal do JSON ("title") **deve** conter o nome completo e oficial do exame.
- O conteúdo ('content') deve ser rico, informativo e bem formatado em Markdown.
- A sua resposta final deve ser **exclusivamente** o objeto JSON completo. Não inclua texto explicativo, comentários ou blocos de código markdown (\`\`\`) envolvendo o JSON.`;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-pro",
            contents: prompt,
            config: {
                tools: [{ googleSearch: {} }],
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
        });
        
        return response.text.trim();

    } catch (error) {
        console.error("Erro ao gerar resumo do tópico:", error);
        throw new Error("Não foi possível gerar o resumo para este tópico. Tente novamente.");
    }
}