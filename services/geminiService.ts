// services/geminiService.ts
// Cliente frontend que chama os endpoints seguros do backend
import { Documentation } from '../types';

// Base URL da API - usa variável de ambiente ou detecta automaticamente
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

/**
 * Gera um plano de estudo completo usando a API do Gemini via backend seguro
 */
export async function generateStudyPlan(
    source: { files?: { name: string; content: string }[]; url?: string },
    studyTopic: string,
    additionalTopics: string
): Promise<Documentation> {
    try {
        const response = await fetch(`${API_BASE_URL}/api/generate-plan`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                source,
                studyTopic,
                additionalTopics
            }),
        });

        // Verifica rate limiting
        if (response.status === 429) {
            const data = await response.json();
            throw new Error(`Você atingiu o limite de requisições. Tente novamente após ${new Date(data.resetAt).toLocaleTimeString()}.`);
        }

        // Verifica outros erros HTTP
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Erro ao gerar plano de estudo.');
        }

        const docData: Documentation = await response.json();

        // Valida estrutura da resposta
        if (!docData.title || !Array.isArray(docData.chapters)) {
            throw new Error("A resposta do servidor não está no formato esperado.");
        }

        return docData;

    } catch (error) {
        console.error("Erro ao gerar plano de estudo:", error);

        if (error instanceof TypeError && error.message.includes('fetch')) {
            throw new Error("Erro de conexão com o servidor. Verifique sua internet.");
        }

        if (error instanceof Error) {
            throw error;
        }

        throw new Error("Não foi possível gerar o plano de estudo. Tente novamente mais tarde.");
    }
}

/**
 * Gera áudio (Text-to-Speech) para um texto usando a API do Gemini via backend seguro
 */
export async function generateSpeech(text: string, voice: string): Promise<string> {
    try {
        if (!text || text.trim().length === 0) {
            throw new Error("O texto para gerar áudio não pode estar vazio.");
        }

        const response = await fetch(`${API_BASE_URL}/api/generate-speech`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text,
                voice
            }),
        });

        // Verifica rate limiting
        if (response.status === 429) {
            const data = await response.json();
            throw new Error(`Você atingiu o limite de requisições. Tente novamente após ${new Date(data.resetAt).toLocaleTimeString()}.`);
        }

        // Verifica outros erros HTTP
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Erro ao gerar áudio.');
        }

        const data = await response.json();

        if (!data.audioData) {
            throw new Error("A resposta do servidor não continha dados de áudio.");
        }

        return data.audioData;

    } catch (error) {
        console.error("Erro ao gerar áudio:", error);

        if (error instanceof TypeError && error.message.includes('fetch')) {
            throw new Error("Erro de conexão com o servidor. Verifique sua internet.");
        }

        if (error instanceof Error) {
            throw error;
        }

        throw new Error("Não foi possível gerar o áudio para este capítulo.");
    }
}

/**
 * Gera um resumo de um capítulo usando a API do Gemini via backend seguro
 */
export async function generateChapterSummary(chapterTitle: string, chapterContent: string): Promise<string> {
    try {
        const response = await fetch(`${API_BASE_URL}/api/generate-summary`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                chapterTitle,
                chapterContent
            }),
        });

        // Verifica rate limiting
        if (response.status === 429) {
            const data = await response.json();
            throw new Error(`Você atingiu o limite de requisições. Tente novamente após ${new Date(data.resetAt).toLocaleTimeString()}.`);
        }

        // Verifica outros erros HTTP
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Erro ao gerar resumo.');
        }

        const data = await response.json();

        if (!data.summary) {
            throw new Error("A resposta do servidor não continha o resumo.");
        }

        return data.summary;

    } catch (error) {
        console.error("Erro ao gerar resumo do tópico:", error);

        if (error instanceof TypeError && error.message.includes('fetch')) {
            throw new Error("Erro de conexão com o servidor. Verifique sua internet.");
        }

        if (error instanceof Error) {
            throw error;
        }

        throw new Error("Não foi possível gerar o resumo para este tópico. Tente novamente.");
    }
}
