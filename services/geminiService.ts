
import { GoogleGenAI } from "@google/genai";

// Ensure the API key is available in the environment variables
const API_KEY = process.env.API_KEY;

if (!API_KEY) {
    console.error("API_KEY for GoogleGenAI is not set in environment variables.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY! });

/**
 * Analyzes report data using the Gemini API.
 * @param reportData The string content of the report to be analyzed.
 * @returns A promise that resolves to the AI-generated analysis as a string.
 */
export async function analyzeDataWithGemini(reportData: string): Promise<string> {
    if (!API_KEY) {
        return Promise.reject("API key is not configured. Please set the API_KEY environment variable.");
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
