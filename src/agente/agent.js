// @ts-nocheck
import { HumanMessage } from '@langchain/core/messages';
import { MemorySaver, StateGraph } from "@langchain/langgraph";
//import { ChatPromptTemplate } from '@langchain/core/prompts';
import { MEDIUM_SYSTEM_PROMPT, getTokenCount } from './utils.js';
import dotenv from 'dotenv';
import { llm_with_tools } from './agentModel.js';
import { AgentState } from './agentState.js';
import { toolNode } from './agentTool.js';
import { createInterface } from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
//import * as vscode from 'vscode';

dotenv.config();

// Define the function that determines whether to continue or not
// Conditional edge function to route to the tool node or end
function shouldContinue(state) {
    const messages = state.messages;
    const lastMessage = messages.at(-1);
    
	//console.log("DEBUG - lastMessage:", lastMessage);
    
    // Se is_requirement è già stato impostato a false in precedenza
    if (state.terminate === true || state.code_saved === true) {
        return "__end__";
    }
    
    // If the LLM makes a tool call, then perform an action
    if (lastMessage?.tool_calls?.length) {
        return "Action";
    }
    
    // Otherwise, we stop (reply to the user)
    return "__end__";
}

// Nodes
async function llmCall(state) {
  if (state.terminate === true || state.is_requirement === false) {
    return state; // Ritorna lo stato senza modifiche
  }

  const repo_context = state.repo_context || "";
  const user_mental_state = state.user_mental_state || "";
  
  // Crea il prompt di sistema
  const systemPrompt = MEDIUM_SYSTEM_PROMPT
    .replace("{input}", state.input)
    .replace("{user_mental_state}", user_mental_state || "")
    + (repo_context ? `\n\nRepository Context:\n${repo_context}` : "");
  
  // Calcola i token del prompt di sistema
  const systemPromptTokens = getTokenCount(systemPrompt);
  
  // Imposta il limite massimo di token (lascia spazio per la risposta)
  const MAX_TOKEN_LIMIT = 110000; // Per gpt-4o-mini (128k - spazio per risposta)
  
  // Limita il numero di messaggi (mantieni solo gli ultimi N messaggi)
  const MAX_MESSAGES = 20; // Mantieni solo gli ultimi 20 messaggi
  
  // Prendi solo gli ultimi N messaggi
  const limitedMessages = state.messages.length > MAX_MESSAGES 
    ? state.messages.slice(-MAX_MESSAGES) 
    : state.messages;
  
  // Assicurati che i messaggi di tipo 'tool' abbiano i corrispondenti messaggi con 'tool_calls'
  const validatedMessages = validateToolMessages(limitedMessages);
  
  // LLM decides whether to call a tool or not
  const result = await llm_with_tools.invoke([{
    role: "system",
    content: systemPrompt
  },
  ...validatedMessages
  ]);

  return {
    ...state,
    messages: [...state.messages, result],
    tool_confidence: result.tool_calls?.[0]?.args?.confidence || 0,
  };
}

/**
 * Valida i messaggi per assicurarsi che ogni messaggio di tipo 'tool' 
 * abbia un corrispondente messaggio con 'tool_calls'
 * @param {Array} messages - Array di messaggi
 * @returns {Array} - Array di messaggi validato
 */
function validateToolMessages(messages) {
  if (!messages || messages.length === 0) return [];
  
  // Mappa per tenere traccia dei tool_call_id e dei loro messaggi corrispondenti
  const toolCallsMap = new Map();
  const validMessages = [];
  
  // Prima passata: identifica tutti i messaggi con tool_calls
  for (const message of messages) {
    if (message?.tool_calls?.length > 0) {
      message.tool_calls.forEach(toolCall => {
        toolCallsMap.set(toolCall.id, message);
      });
    }
  }
  
  // Seconda passata: includi solo i messaggi validi
  for (const message of messages) {
    // Se è un messaggio di tool, verifica che esista il corrispondente messaggio con tool_calls
    if (message.role === 'tool' && message.tool_call_id) {
      if (toolCallsMap.has(message.tool_call_id)) {
        // Assicurati che il messaggio con tool_calls sia incluso prima
        const toolCallMessage = toolCallsMap.get(message.tool_call_id);
        if (!validMessages.includes(toolCallMessage)) {
          validMessages.push(toolCallMessage);
        }
        validMessages.push(message);
      }
      // Se non c'è un messaggio corrispondente, salta questo messaggio di tool
    } else {
      // Includi tutti gli altri tipi di messaggi
      validMessages.push(message);
    }
  }
  
  return validMessages;
}

async function updatedState(state) {
    const messages = state.messages;
    const lastMessage = messages.at(-1);

    // Se l'ultimo messaggio è una risposta di un tool
    if (lastMessage && (lastMessage.role === 'tool' || lastMessage.constructor.name === 'ToolMessage')) {
        
        // Controlla quale tool ha risposto in base al nome
        if (lastMessage.name === 'is_requirement') {
          let content = lastMessage.content;
          if (typeof content === "string") {
            try {
            content = JSON.parse(content);
            } catch (e) {
            // Non è un JSON valido, lascialo così
            }
          }

          if (typeof content === "object" && content !== null) {
            if (content.requirement === false || content.requirement === "false") {
            return {
              ...state,
              is_requirement: false,
              confidence: content.confidence,
              terminate: true
            };
            } else {
            return {
              ...state,
              is_requirement: content.requirement === true || content.requirement === "true",
              confidence: content.confidence
            };
            }
          }
		    }

    if (lastMessage.name === 'refine_requirement' && state.refined_requirement === undefined) {
      return {
              ...state,
              refined_requirement: lastMessage.content,
              input: lastMessage.content
            };
    }

		if (lastMessage.name === 'classify_language' && state.language === undefined) {
      let content = lastMessage.content;
      if (typeof content === "string") {
        try {
          content = JSON.parse(content);
        } catch (e) {
          // Non è un JSON valido, lascialo così
        }
      }
      if (typeof content === "object" && content !== null) {
            return {
               ...state,
                language: content.language,
                tool_confidence: content.confidence
            };
        }
    }
        if (lastMessage.name === 'generate_code' && state.generated_code === undefined) {
            return {
              ...state,
                generated_code: lastMessage.content,
            };
        }

        if (lastMessage.name === 'propose_followup' && state.proposed_followUp === undefined) {
            let content = lastMessage.content;
            if (typeof content === "string") {
              try {
                content = JSON.parse(content);
              } catch (e) {
                // Non è un JSON valido, lascialo così
              }
            }
            if (typeof content === "object" && content !== null) {
              return {
                  ...state,
                  proposed_followUp: content.followup,
              };
          }
        }

        if (lastMessage.name === 'implement_improvement' && state.improved_code === undefined) {
          return {
              ...state,
              improved_code: lastMessage.content,
              generated_code: lastMessage.content // Aggiorniamo anche il codice generato con quello migliorato
          };
        }      

        if (lastMessage.name === 'extract_filename' && state.filename === undefined) {
          let content = lastMessage.content;
          if (typeof content === "string") {
            try {
              content = JSON.parse(content);
            } catch (e) {
              // Non è un JSON valido, lascialo così
            }
          }
        if (typeof content === "object" && content !== null) {
            return {
                ...state,
                filename: content.filename,
                tool_confidence: content.confidence
            };
        }
      }
        if (lastMessage.name === 'save_code') {
            return {
                ...state,
                terminate: true,
                code_saved: true
            };
        }
    }

    return state;
}

//create Memory
let checkpointer = new MemorySaver();

function createAgent() {

  checkpointer = new MemorySaver();
  return new StateGraph(AgentState)
    .addNode("llmCall", llmCall)
    .addNode("tools", toolNode)
    .addNode("updateState", updatedState)
    // Add edges to connect nodes
    .addEdge("__start__", "llmCall")
    .addConditionalEdges(
      "llmCall",
      shouldContinue,
      {
        "Action": "tools",
        "__end__": "__end__",
      }
    )
    .addEdge("tools", "updateState") // After exectuing the tool, update the state
    .addEdge("updateState", "llmCall")
    .compile({ checkpointer,
    interruptBefore:["tools"]
  }); // After updating the state, continue the conversation
}

export let agentBuilder = createAgent();

export function resetAgent() {
  agentBuilder = createAgent();
}
/*
function createImageOfGraph(state) {
	// Ottieni la rappresentazione del grafo
	const graph = agentBuilder.getGraph();
	const dotString = `digraph G {
	  ${Object.entries(graph.nodes).map(([id]) => `  "${id}";`).join('\n')}
	  ${graph.edges.map(edge => `  "${edge.source}" -> "${edge.target}";`).join('\n')}
	}`;
	
	// Salva il file DOT
	const dotFilePath = "./graphState.dot";
	writeFileSync(dotFilePath, dotString);
	console.log(`✅ File DOT salvato in: ${dotFilePath}`);
	
	// Converti il file DOT in PNG usando Graphviz
	const outputImagePath = "./agentGraph.png";
	exec(`dot -Tpng ${dotFilePath} -o ${outputImagePath}`, (error, stdout, stderr) => {
	  if (error) {
		console.error(`❌ Errore nella conversione: ${error.message}`);
		return;
	  }
	  console.log(`✅ Immagine del grafo salvata in: ${outputImagePath}`);
	});
}*/

export async function runAgentForExtention(initialInputs = null, webview) {
  let codeAlreadyPrinted = false;
  let isRequirement = undefined;
  let codeSaved = false;
  let generatedCode = undefined;
  let toolConfidence = 0.0;
  let refinedRequirement = undefined;
  let proposedFollowUp = undefined;
  let improvedCode = undefined;
  let msg = null;
  const printedMessages = new Set();
  
    // Se stiamo iniziando una nuova conversazione, resetta l'agente
    if (initialInputs !== null) {
        resetAgent();
    }

  const streamConfig = {
    configurable: { thread_id: "conversation-num-1" },
    streamMode: "values",
  };
  
  try {
    // Utilizziamo gli input iniziali o null per continuare la conversazione
    for await (const { messages, repo_context, is_requirement, refined_requirement, language, generated_code, filename, code_saved, tool_confidence, proposed_followUp, improved_code } of await agentBuilder.stream(initialInputs, streamConfig)) {
      msg = messages?.[messages.length - 1];

      if (tool_confidence !== undefined) {
        toolConfidence = tool_confidence;
      }

      if (improved_code !== undefined) {
        improvedCode = improved_code;
      }
      
      // Aggiorna lo stato is_requirement
      if (is_requirement !== undefined) {
        isRequirement = is_requirement;
        
        // Se non è un requisito, interrompi immediatamente
        if (isRequirement === false) {
          console.log("❌ Non è un requisito, termino l'esecuzione");
          return { codeAlreadyPrinted: false, is_requirement: false, message: msg };
        }
      }

      if (code_saved === true) {
      	codeSaved = code_saved;
      }

      if (generated_code !== undefined) {
        generatedCode = generated_code;
      }

      if (proposed_followUp !== undefined) {
        proposedFollowUp = proposed_followUp;
      }

      // Gestione dei messaggi
      if (msg?.content) {
        let toPrint = msg.content;
        // Se è una stringa JSON, prova a fare il parse
        if (typeof toPrint === "string") {
          try {
            toPrint = JSON.parse(toPrint);
          } catch (e) {
            // Non è un JSON valido, lascia la stringa originale
          }
        }

        if (typeof toPrint === "object" && toPrint !== null && "confidence" in toPrint) {
          // Prendi il primo campo diverso da 'confidence'
          const keys = Object.keys(toPrint).filter(k => k !== "confidence");
          if (keys.length === 1) {
            toPrint = toPrint[keys[0]];
          } else {
            // Se ci sono più campi oltre a confidence, creo un nuovo oggetto senza 'confidence'
            const { confidence, ...rest } = toPrint;
            toPrint = rest;
          }
        }
        
        // Verifica se il messaggio è una risposta di un tool
        if (msg.role === 'tool' || msg.constructor.name === 'ToolMessage') {
          // Invia il messaggio come tool_output
          // Usa una chiave univoca per evitare duplicati
            const toolKey = `${msg.name}:${JSON.stringify(toPrint)}`;
            if (!printedMessages.has(toolKey)) {
              if (typeof toPrint === "object" && toPrint!== null) {
                toPrint = JSON.stringify(toPrint);
              }
                webview.postMessage({ command: 'tool_output', text: ""+toPrint, toolName: msg.name });
                printedMessages.add(toolKey);
              }
        } else {
          // Aggiungi il messaggio formattato al set e invialo alla webview solo se non è già stato stampato
          if (!printedMessages.has(toPrint)) {
            if (typeof toPrint === "object" && toPrint!== null) {
              toPrint = JSON.stringify(toPrint);
            }
            webview.postMessage({ command: 'initialMessage', text: toPrint });
            printedMessages.add(toPrint);
          }
        }
      }

      // Gestione del codice generato
      if (generated_code !== undefined && !codeAlreadyPrinted && is_requirement === true) {
        codeAlreadyPrinted = true;
      }

      if (codeSaved === true) {
        return { codeAlreadyPrinted: true, is_requirement: true, code_saved: true, tool_confidence: toolConfidence, message: msg, refined_requirement: refinedRequirement };
      }

    }
    
    return { codeAlreadyPrinted, is_requirement: isRequirement, code_saved: codeSaved, tool_confidence: toolConfidence, message: msg, generated_code: generatedCode, refined_requirement: refinedRequirement, proposed_followUp: proposedFollowUp, improved_code: improvedCode };
  } catch (error) {
    console.error("Errore durante l'esecuzione dell'agente:", error);
    return { codeAlreadyPrinted, is_requirement: isRequirement, error: true, tool_confidence: toolConfidence};
  }
}