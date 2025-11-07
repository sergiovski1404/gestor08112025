
import { GoogleGenAI } from "@google/genai";

// Vite browser env vars must use import.meta.env with VITE_ prefix
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY as string | undefined;

let ai: GoogleGenAI | null = null;
if (API_KEY) {
    ai = new GoogleGenAI({ apiKey: API_KEY });
} else {
    console.warn("VITE_GOOGLE_API_KEY is not set; Gemini features are disabled.");
}

/**
 * Analyzes report data using the Gemini API.
 * @param reportData The string content of the report to be analyzed.
 * @returns A promise that resolves to the AI-generated analysis as a string.
 */
export async function analyzeDataWithGemini(reportData: string): Promise<string> {
    if (!ai) {
        // Provide a graceful fallback to avoid breaking the UI
        return "[Análise IA desativada] Configure VITE_GOOGLE_API_KEY para habilitar o Gemini.";
    }
    
    const model = 'gemini-2.5-flash';
    const prompt = `
        Você é um analista especialista em projetos sociais para o programa 'Mais Infância'.
        Com base nos seguintes dados do relatório, forneça uma análise concisa e clara.
        Sua análise deve estar em português e ser formatada em tópicos (usando markdown com asteriscos para listas e negrito para títulos).
        Identifique:
        - **Pontos Positivos e Tendências Chave:**
        - **Pontos de Atenção ou Possíveis Problemas:**
        - **Recomendações e Ações Sugeridas:**

        Dados do Relatório:
        ---
        ${reportData}
        ---
    `;

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
        });

        // Use the .text property for direct access to the string output
        return response.text;
    } catch (error) {
        console.error('Error calling Gemini API:', error);
        throw new Error('Failed to get analysis from Gemini API.');
    }
}
