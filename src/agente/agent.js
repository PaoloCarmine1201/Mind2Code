// @ts-nocheck
import { HumanMessage } from '@langchain/core/messages';
import { MemorySaver, StateGraph } from "@langchain/langgraph";
//import { ChatPromptTemplate } from '@langchain/core/prompts';
import { MEDIUM_SYSTEM_PROMPT } from './utils.js';
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
        //console.log("📝 Flusso terminato in llmCall");
        return state; // Ritorna lo stato senza modifiche
    }

    const repo_context = state.repo_context || "";
	// LLM decides whether to call a tool or not
	const result = await llm_with_tools.invoke([ //devo cambiare con llm_with_tools
	  {
		role: "system",
		content: MEDIUM_SYSTEM_PROMPT.replace("{input}", state.input)
    + (repo_context ? `\n\nRepository Context:\n${repo_context}` : "")
	  },
	  ...state.messages
	]);

	//console.log("🤖 Messaggio LLM:", JSON.stringify(result, null, 2), "fine messaggio LLM");
  
	return {
		...state,
	  	messages: [...state.messages,result],
      tool_confidence: result.tool_calls?.[0]?.args?.confidence || 0, // Aggiungi la confidence se disponibile
	};
}

async function updatedState(state) {
    const messages = state.messages;
    const lastMessage = messages.at(-1);

    //console.log("Vedo il content di last message", lastMessage.content);

    // Se l'ultimo messaggio è una risposta di un tool
    if (lastMessage && (lastMessage.role === 'tool' || lastMessage.constructor.name === 'ToolMessage')) {
        //console.log("📝 Risposta del tool ricevuta:", lastMessage.content);
        
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
				//console.log("SONO QUI", content.requirement, content.confidence);
				if (content.requirement === false || content.requirement === "false") {
				//console.log("Sono quiiiii ", content);
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
            //console.log("📝 Sono nell'if di classify:", lastMessage.content);
            return {
               ...state,
                language: content.language,
                tool_confidence: content.confidence
            };
        }
    }
        if (lastMessage.name === 'generate_code' && state.generated_code === undefined) {
            //console.log("📝 Sono nell'if di generate:", lastMessage.content);
            return {
              ...state,
                generated_code: lastMessage.content,
				//terminate : true
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
            //console.log("📝 Nome file estratto:", lastMessage.content);
            return {
                ...state,
                filename: content.filename,
                tool_confidence: content.confidence
            };
        }
      }
        if (lastMessage.name === 'save_code') {
            //console.log("📝 Codice salvato:", lastMessage.content);
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
  let toolConfidence = 0.0;
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
    for await (const { messages, repo_context, is_requirement, language, generated_code, filename, code_saved, tool_confidence } of await agentBuilder.stream(initialInputs, streamConfig)) {
      const msg = messages?.[messages.length - 1];

      if (tool_confidence !== undefined) {
        toolConfidence = tool_confidence;
        //console.log("📝 Confidence del tool:", toolConfidence);
      }
      
      // Aggiorna lo stato is_requirement
      if (is_requirement !== undefined) {
        isRequirement = is_requirement;
        
        // Se non è un requisito, interrompi immediatamente
        if (isRequirement === false) {
          console.log("❌ Non è un requisito, termino l'esecuzione");
          return { codeAlreadyPrinted: false, is_requirement: false };
        }
      }

      if (code_saved === true) {
      	codeSaved = code_saved;
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
            // Se ci sono più campi oltre a confidence, puoi scegliere come gestirli
            // Ad esempio, puoi creare un nuovo oggetto senza confidence
            const { confidence, ...rest } = toPrint;
            toPrint = rest;
          }
        }
        
        // Verifica se il messaggio è una risposta di un tool
        if (msg.role === 'tool' || msg.constructor.name === 'ToolMessage') {
          // Invia il messaggio come tool_output
          if (!printedMessages.has(toPrint)) {
            if (typeof toPrint === "object" && toPrint!== null) {
              toPrint = JSON.stringify(toPrint);
            }
            webview.postMessage({ command: 'tool_output', text: ""+toPrint, toolName: msg.name });
            printedMessages.add(toPrint);
          }
        } else {
          // Aggiungi il messaggio formattato al set e invialo alla webview solo se non è già stato stampato
          if (!printedMessages.has(toPrint)) {
            console.log("📝 Messaggio LLM:", toPrint);
            //Controllo che toPrint sia un oggetto JSON
            if (typeof toPrint === "object" && toPrint!== null) {
              toPrint = JSON.stringify(toPrint);
            }
            webview.postMessage({ command: 'reply', text: toPrint });
            printedMessages.add(toPrint);
          }
        }
      } else if (msg?.tool_calls?.length > 0) {
        const toolName = msg.tool_calls[0]?.name || "Nome non disponibile";
        const toolMessage = `🔧 Chiamata al tool: ${toolName}`;
        // Invia il messaggio del tool solo se non è già stato stampato
        if (!printedMessages.has(toolMessage)) {
            webview.postMessage({ command: 'reply', text: toolMessage });
            printedMessages.add(toolMessage);
        }
      }


      // Gestione del codice generato
      if (generated_code !== undefined && !codeAlreadyPrinted && is_requirement === true) {
        //console.log("💻 Codice generato disponibile");
        webview.postMessage({ command: 'reply', text: "💻 Codice generato disponibile" });
        try {
          console.log("STAMPO IL GENERATED CODE: " + generated_code);
          const parsedCode = JSON.parse(generated_code);
          //console.log("✅ Codice generato correttamente:");
          webview.postMessage({ command: 'reply', text: "✅ Codice generato correttamente:" });
          //console.log(parsedCode.generated_code || generated_code);
        } catch (e) {
          webview.postMessage({ command: 'reply', text: "✅ Codice generato correttamente qui:" });
        }
        codeAlreadyPrinted = true;
        console.log("-----\n");
      }

      if (codeSaved === true) {
        return { codeAlreadyPrinted: true, is_requirement: true, code_saved: true, tool_confidence: toolConfidence };
      }

    }
    
    return { codeAlreadyPrinted, is_requirement: isRequirement, code_saved: codeSaved, tool_confidence: toolConfidence };
  } catch (error) {
    console.error("Errore durante l'esecuzione dell'agente:", error);
    return { codeAlreadyPrinted, is_requirement: isRequirement, error: true, tool_confidence: toolConfidence};
  }
}