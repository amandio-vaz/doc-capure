import { GoogleGenAI, Modality } from "@google/genai";
import { Documentation } from '../types';

const API_KEY = process.env.API_KEY;
if (!API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

export async function extractDocumentation(url: string): Promise<Documentation> {
    try {
        const prompt = `Você é um assistente de IA especialista em web-crawling e processamento de documentação técnica. Sua tarefa é realizar uma varredura completa na documentação a partir da URL inicial fornecida: ${url}.

**Processo:**
1.  **Análise Inicial:** Comece na URL inicial e identifique a estrutura de navegação principal da documentação (ex: menu lateral, índice de capítulos, links de "próxima página").
2.  **Rastreamento (Crawling):** Siga os links de navegação de forma recursiva para descobrir todos os tópicos e subtópicos da documentação. Mantenha-se dentro do escopo da documentação principal, evitando links externos como blogs, fóruns ou páginas de marketing.
3.  **Extração de Conteúdo:** Para cada página relevante que você visitar, extraia o conteúdo principal, focando no texto técnico, exemplos de código e explicações. Ignore elementos repetitivos como cabeçalhos, rodapés, menus e anúncios.
4.  **Estruturação Final:** Consolide todo o conteúdo extraído em um único objeto JSON. Organize o conteúdo em capítulos lógicos, respeitando a hierarquia encontrada no site (tópicos principais como capítulos, subtópicos como seções dentro do conteúdo do capítulo).

**Formato de Saída (JSON):**
O JSON final deve seguir esta estrutura:
{
  "title": "O título principal e geral de toda a documentação.",
  "chapters": [
    {
      "title": "O título do capítulo/seção principal.",
      "content": "O conteúdo completo e consolidado deste capítulo, em formato Markdown. Preserve a formatação, blocos de código, listas e links."
    }
  ]
}

**Instruções Importantes:**
- Use a ferramenta de busca do Google para acessar o conteúdo das páginas.
- Combine seções curtas e relacionadas em capítulos maiores e mais coesos, se fizer sentido.
- A sua resposta final deve ser **exclusivamente** o objeto JSON completo. Não inclua texto explicativo, comentários ou blocos de código markdown (\`\`\`) envolvendo o JSON.`;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-pro",
            contents: prompt,
            config: {
                tools: [{ googleSearch: {} }],
            },
        });
        
        const rawText = response.text;
        
        // Encontra o início e o fim do objeto JSON principal na resposta.
        // Isso torna a análise mais robusta contra texto extra que a IA possa adicionar.
        const startIndex = rawText.indexOf('{');
        const endIndex = rawText.lastIndexOf('}');

        if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
            throw new Error("A resposta da IA não contém um objeto JSON válido.");
        }
        
        const jsonText = rawText.substring(startIndex, endIndex + 1);
        const docData = JSON.parse(jsonText);

        if (!docData.title || !Array.isArray(docData.chapters)) {
          throw new Error("A resposta da IA não está no formato esperado.");
        }

        return docData;
    } catch (error) {
        console.error("Erro ao extrair documentação:", error);
        if (error instanceof SyntaxError) {
            throw new Error("A resposta da IA não era um JSON válido. Tente novamente.");
        }
        throw new Error("Não foi possível processar a URL. Verifique o link ou tente novamente mais tarde.");
    }
}

export async function generateSpeech(text: string, voice: string): Promise<string> {
    try {
        if (!text || text.trim().length === 0) {
            throw new Error("O texto para gerar áudio não pode estar vazio.");
        }
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text: `Leia o seguinte texto de forma clara e profissional: ${text}` }] }],
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
Sua tarefa é criar um resumo conciso e informativo do capítulo de documentação a seguir.

**Título do Capítulo:** "${chapterTitle}"

**Conteúdo do Capítulo:**
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
        console.error("Erro ao gerar resumo do capítulo:", error);
        throw new Error("Não foi possível gerar o resumo para este capítulo. Tente novamente.");
    }
}