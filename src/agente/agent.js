// @ts-nocheck
import { HumanMessage } from '@langchain/core/messages';
import { MemorySaver, StateGraph } from "@langchain/langgraph";
import { MEDIUM_SYSTEM_PROMPT } from './utils.js';
import dotenv from 'dotenv';
import { llm_with_tools } from './AgentModel.js';
import { AgentState } from './AgentState.js';
import { toolNode } from './AgentTool.js';
import { createInterface } from 'readline/promises';
import { stdin as input, stdout as output } from 'process';

dotenv.config();

// Define the function that determines whether to continue or not
// Conditional edge function to route to the tool node or end
function shouldContinue(state) {
    const messages = state.messages;
    const lastMessage = messages.at(-1);
    
    if (state.terminate === true || state.code_saved === true) {
        return "__end__";
    }
    
    // If the LLM makes a tool call, then perform an action
    if (lastMessage?.tool_calls?.length) {
        return "Action";
    }
    
    return "__end__";
}

// Nodes
async function llmCall(state) {
  if (state.terminate === true || state.is_requirement === false) {
    return state;
  }

  const repo_context = state.repo_context || "";
  const user_mental_state = state.user_mental_state || "";

  const improvementConfirmed =
    state.improvement_confirmed === undefined ? "undefined" : String(state.improvement_confirmed);

  // Costruisci il system prompt sostituendo TUTTI i placeholder
  let systemPrompt = MEDIUM_SYSTEM_PROMPT
  .replace("{input}", String(state.input ?? ""))
  .replace("{user_mental_state}", state.user_mental_state || "")
  .replace("{repo_context}", state.repo_context || "")
  .replace("{improvement_confirmed}", 
           state.improvement_confirmed === undefined ? "undefined" : String(state.improvement_confirmed));

  
  const MAX_MESSAGES = 12;
  const CANDIDATE_WINDOW = 50;
  const recent = (state.messages ?? []).slice(-CANDIDATE_WINDOW);

  let validWindow = validateToolMessages(recent);

  validWindow = trimToMax(validWindow, MAX_MESSAGES);

  const result = await llm_with_tools.invoke([
    { role: "system", content: systemPrompt },
    ...validWindow
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
// Mantieni solo coppie valide assistant(tool_calls) <-> tool
function validateToolMessages(messages) {
  if (!messages?.length) return [];

  // tool_call_id che hanno una risposta 'tool'
  const responded = new Set();
  for (const m of messages) {
    const isTool = m?.role === 'tool' || m?.constructor?.name === 'ToolMessage';
    if (isTool && m.tool_call_id) responded.add(m.tool_call_id);
  }

  const result = [];
  for (const m of messages) {
    const isTool = m?.role === 'tool' || m?.constructor?.name === 'ToolMessage';
    const hasToolCalls = Array.isArray(m?.tool_calls) && m.tool_calls.length > 0;

    if (hasToolCalls) {
      // Tieni l'assistant solo se TUTTI i suoi tool_calls hanno una risposta
      const ids = m.tool_calls.map(tc => tc.id);
      const allResponded = ids.every(id => responded.has(id));
      if (allResponded) result.push(m);
    } else if (isTool) {
      const parentIncluded = result.some(
        am => Array.isArray(am?.tool_calls) && am.tool_calls.some(tc => tc.id === m.tool_call_id)
      );
      if (parentIncluded) result.push(m);
    } else {
      result.push(m);
    }
  }
  return result;
}

function trimToMax(messages, max) {
  let cur = [...messages];
  while (cur.length > max) {
    cur.shift();
    cur = validateToolMessages(cur);
  }
  return cur;
}


async function updatedState(state) {
    const messages = state.messages;
    const lastMessage = messages.at(-1);

    if (state.improvement_confirmed === false && state.awaiting_improvement_confirmation) {
      return {
        ...state,
        awaiting_improvement_confirmation: false
      };
    }

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
                  awaiting_improvement_confirmation: true,
                  tool_confidence: content.confidence
              };
          }
        }

        if (lastMessage.name === 'implement_improvement' && state.improved_code === undefined) {
          return {
              ...state,
              improved_code: lastMessage.content,
              generated_code: lastMessage.content,
              awaiting_improvement_confirmation: false
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
                code_saved: true,
                tool_confidence: lastMessage.content.confidence
            };
        }
    }

    return state;
}

//create Memory
let checkpointer = new MemorySaver();

function createAgent() {

  return new StateGraph(AgentState)
    .addNode("llmCall", llmCall)
    .addNode("tools", toolNode)
    .addNode("updateState", updatedState)
    .addEdge("__start__", "llmCall")
    .addConditionalEdges(
      "llmCall",
      shouldContinue,
      {
        "Action": "tools",
        "__end__": "__end__",
      }
    )
    .addEdge("tools", "updateState")
    .addEdge("updateState", "llmCall")
}

// factory che compila con/senza interrupt
function compileAgent({ interrupt }) {
  return createAgent().compile({
    checkpointer,
    interruptBefore: interrupt ? ["tools"] : []
  });
}

export let agentBuilder = compileAgent({ interrupt: true });
export let agentAuto = compileAgent({ interrupt: false });

export function resetAgent() {
  checkpointer = new MemorySaver(); // resetta la memoria
  agentBuilder = compileAgent({ interrupt: true });   // ricompilato
  agentAuto    = compileAgent({ interrupt: false });  // ricompilato
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
	console.log(`File DOT salvato in: ${dotFilePath}`);
	
	// Converti il file DOT in PNG usando Graphviz
	const outputImagePath = "./agentGraph.png";
	exec(`dot -Tpng ${dotFilePath} -o ${outputImagePath}`, (error, stdout, stderr) => {
	  if (error) {
		console.error(`Errore nella conversione: ${error.message}`);
		return;
	  }
	  console.log(`Immagine del grafo salvata in: ${outputImagePath}`);
	});
}*/

export async function runAgentForExtention(initialInputs = null, webview) {
  let codeAlreadyPrinted = false;
  let isRequirement = undefined;
  let codeSaved = false;
  let generatedCode = undefined;
  let fileName = undefined;
  let toolConfidence = 0.0;
  let refinedRequirement = undefined;
  let proposedFollowUp = undefined;
  let improvedCode = undefined;
  let msg = null;
  let awaitingImprovementConfirmation = false;
  const printedMessages = new Set();
  
    // Se stiamo iniziando una nuova conversazione, resetta l'agente
    if (initialInputs !== null && initialInputs.improvement_confirmed === true) {
      resetAgent();
    }

  const streamConfig = {
    configurable: { thread_id: "conversation-num-1" },
    streamMode: "values",
  };
  
  try {
    for await (const { messages, repo_context, is_requirement, refined_requirement, language, generated_code, filename, code_saved, tool_confidence, proposed_followUp, improved_code, awaiting_improvement_confirmation, improvement_confirmed } of await agentBuilder.stream(initialInputs, streamConfig)) {
      msg = messages?.[messages.length - 1];

      if (tool_confidence !== undefined) {
        toolConfidence = tool_confidence;
      }

      if (improved_code !== undefined) {
        improvedCode = improved_code;
        awaitingImprovementConfirmation = awaiting_improvement_confirmation;
      }

      if(filename !== undefined){
        fileName = filename;
      }
      
      if (is_requirement !== undefined) {
        isRequirement = is_requirement;
        
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
        awaitingImprovementConfirmation = awaiting_improvement_confirmation;
      }

      // Gestione dei messaggi
      if (msg?.content) {
        let toPrint = msg.content;
        if (typeof toPrint === "string") {
          try {
            toPrint = JSON.parse(toPrint);
          } catch (e) {
            // Non è un JSON valido, lascia la stringa originale
          }
        }

        if (typeof toPrint === "object" && toPrint !== null && "confidence" in toPrint) {
          const keys = Object.keys(toPrint).filter(k => k !== "confidence");
          if (keys.length === 1) {
            toPrint = toPrint[keys[0]];
          } else {
            const { confidence, ...rest } = toPrint;
            toPrint = rest;
          }
        }
        
        // Verifica se il messaggio è una risposta di un tool
        if (msg.role === 'tool' || msg.constructor.name === 'ToolMessage') {
            const toolKey = `${msg.name}:${JSON.stringify(toPrint)}`;
            if (!printedMessages.has(toolKey)) {
              if (typeof toPrint === "object" && toPrint!== null) {
                toPrint = JSON.stringify(toPrint);
              }
                webview.postMessage({ command: 'tool_output', text: ""+toPrint, toolName: msg.name });
                printedMessages.add(toolKey);
              }
        } else {
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
        return { codeAlreadyPrinted: true, is_requirement: true, code_saved: true, tool_confidence: toolConfidence, message: msg, refined_requirement: refinedRequirement, filename: fileName };
      }

    }
    
    return { codeAlreadyPrinted, is_requirement: isRequirement, code_saved: codeSaved, tool_confidence: toolConfidence, message: msg, generated_code: generatedCode, refined_requirement: refinedRequirement, proposed_followUp: proposedFollowUp, improved_code: improvedCode, awaiting_improvement_confirmation: awaitingImprovementConfirmation, filename: fileName };
  } catch (error) {
    console.error("Errore durante l'esecuzione dell'agente:", error);
    return { codeAlreadyPrinted, is_requirement: isRequirement, error: true, tool_confidence: toolConfidence};
  }
}