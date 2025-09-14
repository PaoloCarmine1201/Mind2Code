import { ChatOpenAI } from "@langchain/openai";
import { tools } from "./AgentTool.js"
import * as vscode from 'vscode';
import { getApiKey, getModel } from '../commands/configureMind2CodeCommand.js';

export let llm_with_tools;
export let llm;

// Aumentato il limite massimo di token da 1000 a 4000
export async function initializeLlm(context) {
    const apiKey = await getApiKey(context);
    const model = await getModel(context);

    if (!apiKey || !model) {
        console.warn("API Key o Modello non configurati. Si prega di configurare Mind2Code.");
        vscode.window.showWarningMessage("API Key o Modello non configurati per Mind2Code. Si prega di eseguire il comando 'Mind2Code: Configure Mind2Code'.");
        return;
    }

    llm_with_tools = new ChatOpenAI({
        model: model,
        openAIApiKey: apiKey,
        temperature: 0,
        maxTokens: 4000,
    }).bindTools(tools);

    llm = new ChatOpenAI({
        model: model,
        openAIApiKey: apiKey,
        temperature: 0,
        maxTokens: 4000,
    });
}
