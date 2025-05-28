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

	//console.log("🤖 Messaggio LLM:", result, "fine messaggio LLM");
  
	return {
		...state,
	  	messages: [...state.messages,result]
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
            // Se non è un requisito, imposta is_requirement a false e termina
            if (lastMessage.content === false || lastMessage.content === "false") {
                //console.log("📝 Non è un requisito, termino l'esecuzione (updatedState)");
                return {
                    ...state,
                    is_requirement: false,
                    // Aggiungi un flag per indicare che il flusso deve terminare
                    terminate: true
                };
            } else {
                return {
                    ...state,
                    is_requirement: true
                };
            }
        }

		if (lastMessage.name === 'classify_language' && state.language === undefined) {
            //console.log("📝 Sono nell'if di classify:", lastMessage.content);
            return {
               ...state,
                language: lastMessage.content
            };
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
            //console.log("📝 Nome file estratto:", lastMessage.content);
            return {
                ...state,
                filename: lastMessage.content
            };
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
    for await (const { messages, repo_context, is_requirement, language, generated_code, filename, code_saved } of await agentBuilder.stream(initialInputs, streamConfig)) {
      const msg = messages?.[messages.length - 1];
      
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
      if (msg?.content && !printedMessages.has(msg.content)) {
        webview.postMessage({ command: 'reply', text: msg.content });
        printedMessages.add(msg.content);
      } else if (msg?.tool_calls?.length > 0) {
        const toolName = msg.tool_calls[0]?.name || "Nome non disponibile";
        webview.postMessage({ command: 'reply', text: `🔧 Chiamata al tool: ${toolName}` });
      }


      // Gestione del codice generato
      if (generated_code !== undefined && !codeAlreadyPrinted && is_requirement === true) {
        //console.log("💻 Codice generato disponibile");
        webview.postMessage({ command: 'reply', text: "💻 Codice generato disponibile" });
        try {
          const parsedCode = JSON.parse(generated_code);
          //console.log("✅ Codice generato correttamente:");
          webview.postMessage({ command: 'reply', text: "✅ Codice generato correttamente:" });
          //console.log(parsedCode.generated_code || generated_code);
        } catch (e) {
          webview.postMessage({ command: 'reply', text: "✅ Codice generato correttamente qui:" });
          //console.log(generated_code);
        }
        codeAlreadyPrinted = true;
        console.log("-----\n");
      }

      if (codeSaved === true) {
        return { codeAlreadyPrinted: true, is_requirement: true, code_saved: true };
      }

    }
    
    return { codeAlreadyPrinted, is_requirement: isRequirement, code_saved: codeSaved };
  } catch (error) {
    console.error("Errore durante l'esecuzione dell'agente:", error);
    return { codeAlreadyPrinted, is_requirement: isRequirement, error: true };
  }
}