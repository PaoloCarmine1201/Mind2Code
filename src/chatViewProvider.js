// @ts-nocheck
import * as vscode from 'vscode'
import { agentBuilder, runAgentForExtention } from './agente/agent.js';
import { HumanMessage } from "@langchain/core/messages";
import { getGithubContext, createGithubContext } from './commands/githubContext.js';

export class ChatViewProvider {
  constructor(extensionUri, context) {
    this.extensionUri = extensionUri;
    this._view = null;
    this.context = context;
    this.conversationState = null;
    this.waitingForContinuation = false; //flag per continuare la conversazione
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

    let repoContext = await getGithubContext(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath, this.context);
    if (!repoContext) {
      vscode.window.showErrorMessage('Nessun profilo della repository trovato. Creazione in corso...');
      repoContext = createGithubContext(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath, this.context);    
    }

    console.log("Profilo della repository trovato:", JSON.stringify(repoContext, null, 2));

    webview.html = this.getHtml(scriptUri, styleUri);

    webview.onDidReceiveMessage(async message => {
      if (message.command === 'ask') {
        try {
          // Se stiamo aspettando una risposta si/no
          if (this.waitingForContinuation) {
            const response = message.text.toLowerCase();
            
            // Verifica se l'utente vuole continuare
            if (response === 'si' || response === 'sì' || response === 'yes' || response === 's') {
              // Resetta il flag di attesa
              this.waitingForContinuation = false;
              
              // Mostra un indicatore di caricamento
              webview.postMessage({ command: 'status', text: 'Elaborazione in corso...' });
              
              // Continua la conversazione senza nuovi input (usa lo stato esistente)
              const result = await runAgentForExtention(null, webview);
              console.log("Ho ricevuto questo result dalla continuazione:", result);
              
                // Se non è un requisito, non chiedere di continuare
                if (result.is_requirement === false) {
                    webview.postMessage({ 
                        command: 'reply', 
                        text: "❌ Non è un requisito, termino l'esecuzione"
                    });
                return;
                }

              // Se il codice è stato salvato, termina il ciclo
              if (result.code_saved) {
                webview.postMessage({ 
                  command: 'reply', 
                  text: '✅ Codice salvato con successo. Puoi iniziare una nuova richiesta.' 
                });
                this.conversationState = null; // Resetta lo stato per una nuova conversazione
              } else {
                // Altrimenti, chiedi nuovamente se continuare
                this.waitingForContinuation = true;
                webview.postMessage({ 
                  command: 'reply', 
                  text: 'Vuoi continuare? (si/no)' 
                });
              }
            } else {
              // L'utente non vuole continuare
              webview.postMessage({ 
                command: 'reply', 
                text: 'Fine dell\'esecuzione fermata dall\'utente. Puoi iniziare una nuova richiesta.' 
              });
              
              // Resetta lo stato e il flag di attesa
              this.conversationState = null;
              this.waitingForContinuation = false;
            }
          } else {
            // Nuova richiesta (non stiamo aspettando una risposta si/no)
            
            // Mostra un indicatore di caricamento
            webview.postMessage({ command: 'status', text: 'Elaborazione in corso...' });
            
            // Prepara l'input per l'agente
            const inputs = {
              is_requirement: undefined,
              messages: [new HumanMessage(message.text)],
              input: message.text,
              repo_context: repoContext,
              language: undefined,
              generated_code: undefined,
              filename: undefined,
              code_saved: false
            };
            
            // Esegui l'agente e ottieni il risultato
            const result = await runAgentForExtention(inputs, webview);
            console.log("Ho ricevuto questo result:", result);
            
            // Salva lo stato della conversazione
            this.conversationState = result;
            
            // Se il codice è stato salvato, non chiedere di continuare
            if (result.code_saved) {
              webview.postMessage({ 
                command: 'reply', 
                text: '✅ Codice salvato con successo. Puoi iniziare una nuova richiesta.' 
              });
              return;
            }
            
            // Altrimenti, chiedi se continuare
            this.waitingForContinuation = true;
            webview.postMessage({ 
              command: 'reply', 
              text: 'Vuoi continuare? (si/no)' 
            });
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
