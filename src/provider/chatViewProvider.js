// @ts-nocheck
import * as vscode from 'vscode'
import { agentBuilder, runAgentForExtention } from '../agente/agent.js';
import { HumanMessage } from "@langchain/core/messages";
import { getGithubContext, createGithubContext } from '../commands/githubContextCommand.js';

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

    let repo_context = await getGithubContext(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath, this.context);
    if (!repo_context) {
      vscode.window.showErrorMessage('Nessun profilo della repository trovato. Creazione in corso...');
      repo_context = createGithubContext(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath, this.context);    
    }

    console.log("Profilo della repository trovato:", JSON.stringify(repo_context, null, 2));

    webview.html = this.getHtml(scriptUri, styleUri);

    webview.onDidReceiveMessage(async message => {
      if (message.command === 'ask') {
        try {
            if (this.waitingForContinuation) {
              const response = message.text.toLowerCase();
              if (response === 'si' || response === 'sì' || response === 'yes' || response === 's') {
                this.waitingForContinuation = false;
                webview.postMessage({ command: 'status', text: 'Elaborazione in corso...' });
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
              webview.postMessage({ command: 'status', text: 'Elaborazione in corso...' });
              const inputs = {
                is_requirement: undefined,
                messages: [new HumanMessage(message.text)],
                input: message.text,
                repo_context: JSON.stringify(repo_context),
                language: undefined,
                generated_code: undefined,
                filename: undefined,
                code_saved: false,
                tool_confidence: undefined, // Imposta un valore di default
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

async function handleAgentResult(result, webview, continueCallback) {
  // Se il codice è stato salvato, termina
  if (result.code_saved) {
    webview.postMessage({ 
      command: 'reply', 
      text: '✅ Codice salvato con successo. Puoi iniziare una nuova richiesta.' 
    });
    this.conversationState = null;
    return;
  }

  // Se c'è un tool_output, invialo come messaggio separato
  if (result.tool_output) {
    webview.postMessage({
      command: 'tool_output',
      text: result.tool_output
    });
  }

  // Se non è un requisito, termina
  if (result.is_requirement === false) {
    webview.postMessage({ 
      command: 'reply', 
      text: "❌ Non è un requisito, termino l'esecuzione"
    });
    return;
  }

  // --- Qui la logica generalizzata per la confidence ---
  if (result.tool_confidence > 0.7) {
    webview.postMessage({
      command: 'reply',
      text: `Confidence > 0.7, continuo automaticamente.`
    });
    webview.postMessage({ command: 'status', text: 'Elaborazione in corso...' });
    // Continua automaticamente
    const autoContinueResult = await continueCallback();
    // Ricorsione: gestisci il nuovo risultato
    await handleAgentResult.call(this, autoContinueResult, webview, continueCallback);
  } else {
    // Chiedi all'utente se vuole continuare
    this.waitingForContinuation = true;
    webview.postMessage({
      command: 'reply',
      text: 'Vuoi continuare? (si/no)'
    });
  }
}
