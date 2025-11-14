import { GoogleGenAI, Modality } from "@google/genai";
import { Documentation } from '../types';

const API_KEY = process.env.API_KEY;
if (!API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

export async function extractDocumentation(url: string): Promise<Documentation> {
    try {
        const prompt = `Você é um assistente de IA especialista em processar documentação técnica de sites. Analise o conteúdo encontrado na URL a seguir: ${url}. Use a busca do Google para acessar e entender o conteúdo. Sua tarefa é extrair e estruturar a documentação em um formato JSON claro e conciso.

A estrutura do JSON deve ser a seguinte:
{
  "title": "O título principal da documentação.",
  "chapters": [
    {
      "title": "O título do capítulo.",
      "content": "O conteúdo completo do capítulo em formato Markdown."
    }
  ]
}

Regras:
- O \`content\` deve ser em formato Markdown, preservando a formatação do texto, blocos de código (com a linguagem especificada, se possível), listas e links.
- Ignore elementos de navegação, cabeçalhos, rodapés e anúncios. Foco total no conteúdo principal.
- Agrupe seções muito pequenas em capítulos lógicos para uma melhor organização.

Responda exclusivamente com o objeto JSON. Sua resposta deve ser apenas o JSON, sem texto explicativo, comentários ou blocos de código markdown (\`\`\`).`;

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
3.  O resumo deve ser claro, coeso и de fácil compreensão.
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