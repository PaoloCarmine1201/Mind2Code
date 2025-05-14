// @ts-nocheck
const vscode = acquireVsCodeApi();
/*
  * acquireVsCodeApi() è una funzione fornita da VS Code per ottenere un'istanza dell'API di comunicazione tra il webview e l'estensione.
  * Questa API consente al webview di inviare messaggi all'estensione e ricevere risposte.
  * È utile per comunicare tra il contenuto del webview e il codice dell'estensione.
  * 
  * const vscode = acquireVsCodeApi();
  * vscode.postMessage(message)
    Invia un messaggio al backend (file extension.js, chatViewProvider.js, ecc.).

    vscode.postMessage({ command: 'ask', text: 'Ciao!' });
    
    Nel backend, lo ricevi con:
    webview.onDidReceiveMessage(message => {
      if (message.command === 'ask') { ... }
    });
*/

document.getElementById('send').addEventListener('click', () => {
  const input = document.getElementById('input');
  const text = input.value.trim();
  if (!text) return;
  appendMessage('Tu', text);
  
  // Disabilita l'input durante l'elaborazione
  input.disabled = true;
  document.getElementById('send').disabled = true;
  
  vscode.postMessage({ command: 'ask', text });
  input.value = '';
});

window.addEventListener('message', event => {
  const message = event.data;
  
  if (message.command === 'reply') {
    appendMessage('Assistente', message.text);
    // Riabilita l'input dopo la risposta
    document.getElementById('input').disabled = false;
    document.getElementById('send').disabled = false;
  } else if (message.command === 'status') {
    // Mostra lo stato di caricamento
    const loadingMsg = document.createElement('div');
    loadingMsg.id = 'loading-message';
    loadingMsg.innerHTML = `<em>${message.text}</em>`;
    loadingMsg.style.marginBottom = '10px';
    loadingMsg.style.color = '#888';
    document.getElementById('messages').appendChild(loadingMsg);
    document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
  }
});

function appendMessage(sender, text) {
  // Rimuovi l'indicatore di caricamento se presente
  const loadingMsg = document.getElementById('loading-message');
  if (loadingMsg) {
    loadingMsg.remove();
  }
  
  const messages = document.getElementById('messages');
  const msg = document.createElement('div');
  
  // Supporto per il markdown di base (codice)
  let formattedText = text;
  
  // Gestisci i blocchi di codice
  /*formattedText = formattedText.replace(/```(\w*)\n([\s\S]*?)```/g, function(match, language, code) {
    return `<pre class="code-block"><code>${code}</code></pre>`;
  });*/
  
  msg.innerHTML = `<strong>${sender}:</strong> ${formattedText}`;
  msg.style.marginBottom = '10px';
  messages.appendChild(msg);
  messages.scrollTop = messages.scrollHeight;
}