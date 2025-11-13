
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Documentation } from '../types';

const API_KEY = process.env.API_KEY;
if (!API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

const docSchema = {
    type: Type.OBJECT,
    properties: {
        title: {
            type: Type.STRING,
            description: "O título principal da documentação."
        },
        chapters: {
            type: Type.ARRAY,
            description: "Uma lista de capítulos da documentação.",
            items: {
                type: Type.OBJECT,
                properties: {
                    title: {
                        type: Type.STRING,
                        description: "O título do capítulo."
                    },
                    content: {
                        type: Type.STRING,
                        description: "O conteúdo completo do capítulo em formato Markdown."
                    }
                },
                required: ["title", "content"]
            }
        }
    },
    required: ["title", "chapters"]
};

export async function extractDocumentation(url: string): Promise<Documentation> {
    try {
        const prompt = `Você é um assistente de IA especialista em processar documentação técnica de sites. Analise o conteúdo encontrado na URL a seguir: ${url}. Use a busca do Google para acessar e entender o conteúdo. Sua tarefa é extrair e estruturar a documentação em um formato JSON claro e conciso.

O JSON deve seguir o schema fornecido.
- \`title\`: O título principal da documentação.
- \`chapters\`: Uma lista de capítulos.
  - Cada capítulo deve ter \`title\` e \`content\`.
  - O \`content\` deve ser em formato Markdown, preservando a formatação do texto, blocos de código (com a linguagem especificada, se possível), listas e links.
  - Ignore elementos de navegação, cabeçalhos, rodapés e anúncios. Foco total no conteúdo principal.
  - Agrupe seções muito pequenas em capítulos lógicos para uma melhor organização.

Responda exclusivamente com o objeto JSON. Não inclua texto explicativo antes ou depois do JSON, e não use blocos de código markdown (\`\`\`) para envolver o JSON.`;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-pro",
            contents: prompt,
            config: {
                tools: [{ googleSearch: {} }],
                responseMimeType: "application/json",
                responseSchema: docSchema,
            },
        });
        
        const jsonText = response.text.trim();
        const docData = JSON.parse(jsonText);

        if (!docData.title || !Array.isArray(docData.chapters)) {
          throw new Error("A resposta da IA não está no formato esperado.");
        }

        return docData;
    } catch (error) {
        console.error("Erro ao extrair documentação:", error);
        throw new Error("Não foi possível processar a URL. Verifique o link ou tente novamente mais tarde.");
    }
}

export async function generateSpeech(text: string): Promise<string> {
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
                        prebuiltVoiceConfig: { voiceName: 'Kore' },
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
