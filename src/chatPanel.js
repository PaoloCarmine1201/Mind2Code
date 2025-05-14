import * as vscode from 'vscode';

export function createChatPanel(context) {
    const panel = vscode.window.createWebviewPanel(
        'openaiChat',
        'OpenAI Chat Agent',
        vscode.ViewColumn.One,
        {
            enableScripts: true,
        }
    );

    panel.webview.html = getWebviewContent();

    panel.webview.onDidReceiveMessage(
        message => {
          if (message.command === 'ask') {
            // Solo stampa nella console di VS Code per ora
            console.log('Messaggio ricevuto dalla Webview:', message.text);
    
            // Risposta di test statica
            panel.webview.postMessage({
              command: 'reply',
              text: `Hai scritto: "${message.text}"`
            });
          }
        },
        undefined,
        context.subscriptions
      );
}

function getWebviewContent() {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <body>
      <h2>Chat con OpenAI (fase UI)</h2>
      <textarea id="prompt" rows="5" style="width:100%"></textarea>
      <button onclick="sendMessage()">Invia</button>
      <pre id="output"></pre>
      <script>
        const vscode = acquireVsCodeApi();
        function sendMessage() {
          const text = document.getElementById('prompt').value;
          vscode.postMessage({ command: 'ask', text });
        }

        window.addEventListener('message', event => {
          const message = event.data;
          if (message.command === 'reply') {
            document.getElementById('output').textContent = message.text;
          }
        });
      </script>
    </body>
    </html>
  `;
}