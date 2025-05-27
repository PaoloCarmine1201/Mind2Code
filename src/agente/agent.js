// @ts-nocheck
import { HumanMessage } from '@langchain/core/messages';
import { MemorySaver, StateGraph } from "@langchain/langgraph";
//import { ChatPromptTemplate } from '@langchain/core/prompts';
import { MEDIUM_SYSTEM_PROMPT } from './utils.js';
import dotenv from 'dotenv';
import { llm_with_tools } from './AgentModel.js';
import { AgentState } from './AgentState.js';
import { toolNode } from './AgentTool.js';
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

	// LLM decides whether to call a tool or not
	const result = await llm_with_tools.invoke([ //devo cambiare con llm_with_tools
	  {
		role: "system",
		content: MEDIUM_SYSTEM_PROMPT.replace("{input}", state.input)
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
	const outputImagePath = "./graphState.png";
	exec(`dot -Tpng ${dotFilePath} -o ${outputImagePath}`, (error, stdout, stderr) => {
	  if (error) {
		console.error(`❌ Errore nella conversione: ${error.message}`);
		return;
	  }
	  console.log(`✅ Immagine del grafo salvata in: ${outputImagePath}`);
	});
}*/

// Use the agent, vecchia implementazione senza interrupt before
/*
const rl = createInterface({ input, output });
const inputText = await rl.question('Enter your requirement: ');
rl.close();

let config = { configurable: { thread_id: "conversation-num-1" } };
// Prepara l'input iniziale
const inputs = {
	is_requirement: undefined,
	messages: [new HumanMessage(inputText)],
	input: inputText,
	language: undefined,
	generated_code: undefined
  };
  
  // Variabili per tenere traccia di ciò che è già stato stampato
  let codeAlreadyPrinted = false;
  let lastMessageContent = null;
  
  // Usa lo streaming invece dell'invocazione diretta
  console.log("🚀 Avvio dell'agente in modalità streaming...\n");
  
for await (const { messages, is_requirement, language, generated_code } of await agentBuilder.stream(inputs, {
    ...config,
    streamMode: "values",
})) {
    // Ottieni l'ultimo messaggio
    let msg = messages[messages?.length - 1];
	
	// Evita di stampare lo stesso messaggio più volte
	if (msg?.content && msg.content !== lastMessageContent) {
	  console.log("📝 Contenuto del messaggio:");
	  console.log(msg.content);
	  lastMessageContent = msg.content;
	} else if (msg?.tool_calls?.length > 0) {
	  console.log("🔧 Chiamata a tool:");
	  console.log(msg.tool_calls);
	} else if (msg?.role === 'tool') {
	  console.log("🔧 Risposta del tool:");
	  console.log(`Nome: ${msg.name}, Contenuto: ${msg.content}`);
	} else if (msg && msg.content !== lastMessageContent) {
	  console.log("ℹ️ Altro tipo di messaggio:");
	  console.log(msg);
	  if (msg.content) lastMessageContent = msg.content;
	}
	
	// Stampa il codice generato solo se non è già stato stampato e se è un requisito
	if (generated_code !== undefined && !codeAlreadyPrinted && is_requirement === true) {
	  console.log("💻 Codice generato disponibile");
	  try {
		// Prova a fare il parsing del JSON se è in formato JSON
		const parsedCode = JSON.parse(generated_code);
		if (parsedCode.generated_code) {
		  console.log("✅ Codice generato correttamente:");
		  console.log(parsedCode.generated_code);
		} else {
		  console.log("✅ Codice generato correttamente:");
		  console.log(generated_code);
		}
	  } catch (e) {
		// Se non è in formato JSON, stampa direttamente
		console.log("✅ Codice generato correttamente:");
		console.log(generated_code);
	  }
	  
	  // Imposta il flag per evitare di stampare nuovamente
	  codeAlreadyPrinted = true;
	  console.log("-----\n");
	}
  }*/

// Funzione per gestire i messaggi e il codice generato
export async function runAgent(initialInputs = null) {
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
    for await (const { messages, is_requirement, language, generated_code, filename, code_saved } of await agentBuilder.stream(initialInputs, streamConfig)) {
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
        console.log("📩 Assistant:", msg.content);
        printedMessages.add(msg.content);
      } else if (msg?.tool_calls?.length > 0) {
        console.log("🔧 Chiamata a tool:");
        console.log(msg.tool_calls);
      }


      // Gestione del codice generato
      if (generated_code !== undefined && !codeAlreadyPrinted && is_requirement === true) {
        console.log("💻 Codice generato disponibile");
        try {
          const parsedCode = JSON.parse(generated_code);
          console.log("✅ Codice generato correttamente:");
          console.log(parsedCode.generated_code || generated_code);
        } catch (e) {
          console.log("✅ Codice generato correttamente:");
          console.log(generated_code);
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

// Funzione principale
async function main() {
  const rl = createInterface({ input, output });
  
  try {
    // Prima esecuzione con input dell'utente
    const inputText = await rl.question('Enter your requirement: ');
    
    const inputs = {
      is_requirement: undefined,
      messages: [new HumanMessage(inputText)],
      input: inputText,
      language: undefined,
      generated_code: undefined,
      filename: undefined,
      code_saved: false // Aggiunto il flag codeSave
    };
    
    console.log("🚀 Avvio dell'agente in modalità streaming...\n");
    
    // Esegui l'agente con l'input iniziale
    let result = await runAgent(inputs);

    // Verifica se l'esecuzione deve continuare
    if (result.is_requirement === false) {
      return; // Termina immediatamente se non è un requisito
    }
    
    // Loop per continuare la conversazione con conferma dell'utente
    while (true) {
      const continueResponse = await rl.question('Vuoi continuare? (si/no): ');
      
      if (continueResponse.toLowerCase() === 'si' || continueResponse.toLowerCase() === 'yes') {
        // Continua la conversazione senza nuovi input (usa lo stato esistente)
        result = await runAgent(null);
        
        // Verifica se l'esecuzione deve terminare
        if (result.is_requirement === false) {
          return; // Termina immediatamente se non è un requisito
        }
        
        if (result.code_saved) {
          console.log("✅ Codice salvato con successo. Terminazione automatica.");
          return; // Termina immediatamente dopo aver generato il codice
        }
      } else {
        console.log("Fine dell'esecuzione fermata dall'utente.");
        break;
      }
    }
  } finally {
    // Chiudi l'interfaccia readline alla fine
    rl.close();
  }
}
// Avvia il programma
main();