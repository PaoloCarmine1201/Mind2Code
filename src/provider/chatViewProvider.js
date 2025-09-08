// @ts-nocheck
import * as vscode from 'vscode'
import { agentBuilder, runAgentForExtention } from '../agente/agent.js';
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { getGithubContext, createGithubContext } from '../commands/githubContextCommand.js';
import { getToMProfile, StartTomQuiz } from '../commands/TheoryOfMindCommand.js';
import { save_code } from '../agente/AgentTool.js';
import { agentAuto } from '../agente/agent.js';

export class ChatViewProvider {
  constructor(extensionUri, context) {
    this.extensionUri = extensionUri;
    this._view = null;
    this.context = context;
    this.conversationState = null;
    this.waitingForContinuation = false;
    this.codeToSave = null;
    this.fileName = null;
    this.shownMessages = {
      generated_code: false,
      proposed_followUp: false,
      improved_code: false
    }; //flag per continuare la conversazione
  }

  async resolveWebviewView(webviewView) {
    this._view = webviewView;
    const webview = webviewView.webview;

    webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
      retainContextWhenHidden: true  // Mantiene il contesto della webview quando è nascosta
    };

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'app.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'app.css')
    );

    let repo_context = await getGithubContext(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath, this.context);
    if (!repo_context) {
      vscode.window.showErrorMessage('Nessun profilo della repository trovato. Creazione in corso...');
      repo_context = createGithubContext(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath, this.context);    
    }

    webview.html = this.getHtml(scriptUri, styleUri);
    
    webview.postMessage({
      command: 'repoContext',
      text: repo_context
    });
    //console.log("Profilo della repository trovato:", JSON.stringify(repo_context, null, 2));

    webview.onDidReceiveMessage(async message => {
      if (message.command === 'ask') {
        try {
            if (this.waitingForContinuation) {
              webview.postMessage({ command: 'unlockInput' }); // sblocca
              const response = message.text.toLowerCase();
              if (response === 'si' || response === 'sì' || response === 'yes' || response === 's') {
                this.waitingForContinuation = false;
                
                // Aggiungi messaggio di caricamento
                webview.postMessage({ command: 'loading', text: 'Sto pensando...' });
                //TODO: dovrei andare a creare qua i nuovi input dell'utente dicendo che l'utente ha accetta di implementare il miglioramento
                //ma se creo nuovi input, vado a creare una conversazione da capo dell'agente perchè c'è reset agent, devo capire come fare
                const result = await runAgentForExtention(null, webview);
                await handleAgentResult.call(this, result, webview, async () => await runAgentForExtention(null, webview));
              } else {
                webview.postMessage({ 
                  command: 'reply', 
                  text: 'Fine dell\'esecuzione fermata dall\'utente. Puoi iniziare una nuova richiesta.' 
                });
                this.conversationState = null;
                this.waitingForContinuation = false;
              }
            } else {
              webview.postMessage({ command: 'status', text: '⏳ Attendi: sto recuperando il profilo utente...' });

              let user_mental_state = await getToMProfile(this.context);

              // Se il profilo non esiste, invita l'utente a completare il quiz e attendi
              if (!user_mental_state) {
                vscode.window.showWarningMessage('Devi completare il profilo utente prima di usare la chat.');
                await StartTomQuiz(this.context);

                // Ciclo di attesa asincrono: controlla ogni secondo se il profilo è stato completato
                while (!user_mental_state) {
                  await new Promise(res => setTimeout(res, 15000));
                  user_mental_state = await getToMProfile(this.context);
                }
                webview.postMessage({ command: 'status', text: '✅ Profilo utente caricato, puoi continuare!' });
              }
              console.log("Profilo utente caricato ok:");
              const inputs = {
                is_requirement: undefined,
                messages: [new HumanMessage(message.text)],
                input: message.text,
                repo_context: JSON.stringify(repo_context),
                user_mental_state: JSON.stringify(user_mental_state),
                language: undefined,
                generated_code: undefined,
                filename: undefined,
                code_saved: false,
                tool_confidence: undefined, // Imposta un valore di default
                proposed_followUp: undefined,
                improvement_confirmed: true,
                awaiting_improvement_confirmation: undefined,
                improved_code: undefined
              };
              const result = await runAgentForExtention(inputs, webview);
              await handleAgentResult.call(this, result, webview, async () => await runAgentForExtention(null, webview));
            }
          } catch (error) {
          console.error('Errore durante l\'elaborazione:', error);
          webview.postMessage({ 
            command: 'reply', 
            text: 'Si è verificato un errore durante l\'elaborazione della richiesta: ' + error.message 
          });
          
          // Resetta lo stato in caso di errore
          this.conversationState = null;
          this.waitingForContinuation = false;
        }
      }

      if (message.command === 'askFollowUp') {
        try {
          if (this.waitingForContinuation) {
              webview.postMessage({ command: 'unlockInput' }); // sblocca
              const response = message.text.toLowerCase();
              if (response === 'si' || response === 'sì' || response === 'yes' || response === 's') {
                console.log("Sono qui dentro nel si, teoricamente mando avanti l\'esecuzione cosi com\'è")
                this.waitingForContinuation = false;
                
                // Aggiungi messaggio di caricamento
                webview.postMessage({ command: 'loading', text: 'Sto pensando...' });
                //non modifico gli input
                //esecuzione con agent con interrupt before
                {
                  /*const result = await runAgentForExtention(null, webview);
                  await handleAgentResult.call(this, result, webview, async () => await runAgentForExtention(null, webview));*/
                }
                // Comunica la scelta all’agent (senza messaggi nuovi → niente reset)
                const stateDelta = { improvement_confirmed: true };

                const streamConfig = { 
                  configurable: { thread_id: "conversation-num-1" }, 
                  streamMode: "values" 
                };
                try {
                  if (!this._printedMessages) this._printedMessages = new Set();
                  
                  //Esecuzione con altro agent senza interrupt before, stessa memoria stesso thread messaggi
                  for await (const snapshot of await agentAuto.stream(stateDelta, streamConfig)) {

                    // --- 1) Estrai l'ultimo messaggio e stampalo come fai altrove ---
                    const messages = snapshot?.messages ?? [];
                    const msg = messages.at ? messages.at(-1) : messages[messages.length - 1];

                    if (msg?.content) {
                      let toPrint = msg.content;

                      // prova il parse JSON se è stringa
                      if (typeof toPrint === "string") {
                        try { toPrint = JSON.parse(toPrint); } catch (_) { /* lascia com'è */ }
                      }

                      // se è un oggetto con 'confidence', rimuovilo
                      if (toPrint && typeof toPrint === "object" && "confidence" in toPrint) {
                        const { confidence, ...rest } = toPrint;
                        const keys = Object.keys(rest);
                        toPrint = (keys.length === 1) ? rest[keys[0]] : rest;
                      }

                      const isToolMsg = (msg.role === 'tool' || msg.constructor?.name === 'ToolMessage');
                      const printedMessages = this._printedMessages;

                      if (isToolMsg) {
                        const key = `${msg.name}:${typeof toPrint === "object" ? JSON.stringify(toPrint) : String(toPrint)}`;
                        if (!printedMessages.has(key)) {
                          let text = toPrint;
                          if (typeof text === "object" && text !== null) text = JSON.stringify(text);
                          webview.postMessage({ command: 'tool_output', text: String(text), toolName: msg.name });
                          printedMessages.add(key);
                        }
                      } else {
                        const key = typeof toPrint === "object" && toPrint !== null ? JSON.stringify(toPrint) : String(toPrint);
                        if (!printedMessages.has(key)) {
                          let text = toPrint;
                          if (typeof text === "object" && text !== null) text = JSON.stringify(text);
                          webview.postMessage({ command: 'initialMessage', text: String(text) });
                          printedMessages.add(key);
                        }
                      }
                    }

                    if (snapshot.improved_code && !this.shownMessages.improved_code) {
                      webview.postMessage({ command: 'reply', text: '✅ Codice migliorato disponibile.\nPuoi visualizzare il codice migliorato qui.' });
                      this.shownMessages.improved_code = true;
                    }

                    if (snapshot?.code_saved) {
                      webview.postMessage({ command: 'reply', text: '✅ Codice migliorato e salvato. Puoi iniziare una nuova richiesta.' });
                      // reset flag UI
                      this.conversationState = null;
                      this.shownMessages = { generated_code: false, proposed_followUp: false, improved_code: false };
                      break;
                    }
                  }
                } catch (err) {
                  console.error('Errore in auto-run:', err);
                  webview.postMessage({ command: 'reply', text: '❌ Errore durante il miglioramento/salvataggio: ' + (err?.message || String(err)) });
                  this.waitingForContinuation = false;
                }
                
              } else {
                webview.postMessage({ 
                  command: 'reply', 
                  text: 'Miglioramento non implementato. Procedo a salvare il codice finale, dopo puoi iniziare una nuova richiesta' 
                });
                webview.postMessage({ command: 'loading', text: 'Sto pensando...' });
                console.log("Sono qui dentro nel no, non voglio implementare il miglioramento")
                {
                  /*
                  prendo gli stessi input di prima ma aggiungo che non voglio implementare il codice, 
                  // andando a modificare improvement_confirmed nello stato a false, 
                  // per fare capire che non deve implementare il miglioramento ma deve direttamente salvare il codice
                  // esecuzione automatica con agent (tempo aggiuntivo)
  
                  const result = await runAgentForExtention({
                      improvement_confirmed: false,
                      awaiting_improvement_confirmation: false,
                    }, webview);
                  await handleAgentResult.call(this, result, webview, async () => await runAgentForExtention(null, webview));
                  
                  console.log('typeof code:', typeof this.codeToSave);
                  console.log('preview code:', (this.codeToSave || '').slice(0, 60));
                  console.log('typeof filename:', typeof this.fileName, 'value:', this.fileName);*/
                }
                this.waitingForContinuation = false;

                const result = await save_code.invoke({
                  generated_code: this.codeToSave,
                  filename: this.fileName,
                  confidence: 0.7
                });
                if (result) {
                  webview.postMessage({ command: 'reply', text: `✅ Codice salvato in ${this.fileName}. Puoi iniziare una nuova richiesta.` });
                } else {
                  webview.postMessage({ command: 'reply', text: '❌ Errore durante il salvataggio del codice.' });
                }

              }

              // Reset stato conversazione lato UI
              this.conversationState = null;
              this.shownMessages = { generated_code: false, proposed_followUp: false, improved_code: false };

            }
        } catch (error) {
          console.error('Errore durante l\'elaborazione:', error);
          webview.postMessage({ 
            command: 'reply', 
            text: 'Si è verificato un errore durante l\'elaborazione della richiesta: ' + error.message 
          });
          // Resetta lo stato in caso di errore
          this.conversationState = null;
          this.waitingForContinuation = false;
        }
      }
    });
  }

  // Metodo per aggiornare il contesto della repository
  updateRepoContext(repoContext) {
    if (this._view) {
      this._view.webview.postMessage({
        command: 'updateRepoContext',
        text: repoContext
      });
    }
  }

  sendToMProfileToChat(profile) {
    if (this._view) {
      this._view.webview.postMessage({
        command: 'showToMProfile',
        text: profile
      });
    }
  }
  
  // Metodo per pulire la chat
  clearChat() {
    if (this._view) {
      this._view.webview.postMessage({ command: 'clearChat' });
    }
  }

  getHtml(scriptUri, styleUri) {
    return `
      <!DOCTYPE html>
      <html lang="it">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link href="${styleUri}" rel="stylesheet" />
      </head>
      <body>
        <div class="container">
          <div class="chat-container" id="messages"></div>
          <div id="confirmation-buttons"></div>
            <div class="input-container" id="input-area">
              <input type="text" id="input" placeholder="Scrivi un messaggio..." />
              <button id="send">➤</button>
            </div>
        </div>
        <script src="${scriptUri}"></script>
      </body>
      </html>
    `;
  }
}

async function handleAgentResult(result, webview, continueCallback) {
  const msg = result?.message || null;

  // Se il codice è stato salvato, termina e resetta lo stato dei messaggi mostrati
  if (result.code_saved) {
    webview.postMessage({ 
      command: 'reply', 
      text: '✅ Codice salvato con successo. Puoi iniziare una nuova richiesta.' 
    });
    this.conversationState = null;
    this.shownMessages = {
      generated_code: false,
      proposed_followUp: false,
      improved_code: false
    };
    return;
  }

  if (result.filename) {
    this.fileName = result.filename;
  }

  // Mostra solo i messaggi che non sono stati ancora mostrati
  if (result.generated_code && !this.shownMessages.generated_code) {
    webview.postMessage({ 
      command: 'reply', 
      text: '✅ Codice generato disponibile.\nPuoi visualizzare il codice generato qui.'
    });
    this.codeToSave = result.generated_code;
    this.fileName = result.filename;
    this.shownMessages.generated_code = true;
  }
  
  if (result.proposed_followUp && !this.shownMessages.proposed_followUp) {
    webview.postMessage({ 
      command: 'reply', 
      text: '✅ Domanda follow up disponibile.\nPuoi visualizzare la domanda follow up qui.'
    });
    this.shownMessages.proposed_followUp = true;
  }
  
  if (result.improved_code && !this.shownMessages.improved_code) {
    webview.postMessage({ 
      command: 'reply', 
      text: '✅ Codice migliorato disponibile.\nPuoi visualizzare il codice migliorato qui.'
    });
    this.shownMessages.improved_code = true;
  }

  // Se non è un requisito, termina
  if (result.is_requirement === false) {
    webview.postMessage({ 
      command: 'reply', 
      text: "❌ Non è un requisito, termino l'esecuzione"
    });
    return;
  }

  if (result.awaiting_improvement_confirmation) {
    this.waitingForContinuation = true;
    webview.postMessage({ command: 'lockInput' }); // blocca subito
    webview.postMessage({
      command: 'askForFollowup',
      text: 'Vuoi migliorare il codice?',
      options: [
          { label: 'Si, voglio migliorarlo', value: 'si' },
          { label: 'No, voglio salvarlo', value: 'no' }
        ]
      });
      return;
  }
  
  // --- Qui la logica generalizzata per la confidence ---
  if (result.tool_confidence > 0.7 && msg?.tool_calls?.length > 0 && msg) {
    const toolName = msg.tool_calls[0]?.name || "Nome non disponibile";
    const toolMessage = `${toolName}`;
    webview.postMessage({
      command: 'reply',
      text: 'La tua richiesta è molto chiara, sono sicuro del prossimo passo da eseguire.\n' + 
        'Effettuo automaticamente la chiamata al tool ' + toolMessage + '.'
    });
    
    // Aggiungi messaggio di caricamento prima di continuare
    webview.postMessage({ command: 'loading', text: 'Sto pensando...' });
    
    // Continua automaticamente
    const autoContinueResult = await continueCallback();
    
    // Ricorsione: gestisci il nuovo risultato
    await handleAgentResult.call(this, autoContinueResult, webview, continueCallback); 
  } else {
    // Chiedi all'utente se vuole continuare
    this.waitingForContinuation = true;
    if(msg?.tool_calls?.length > 0 && msg && result.tool_confidence < 0.7) {
      const toolName = msg.tool_calls[0]?.name || "Nome non disponibile";
      const toolMessage = `Non sono abbastanza sicuro della tua richiesta, ho bisogno di chiamare il tool: ${toolName}\n`;
      webview.postMessage({ command: 'lockInput' }); // blocca subito
      webview.postMessage({
        command: 'askConfirmation',
        text: toolMessage + 
        'Vuoi continuare con l\'esecuzione del tool?',
        options: [
            { label: 'Esegui tool', value: 'si' },
            { label: 'Annulla esecuzione', value: 'no' }
          ]
        });
    }
  }
}
