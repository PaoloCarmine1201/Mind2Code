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

// Funzione per aggiungere un messaggio alla chat
function appendMessage(sender, text, isLoading = false) {
    const chatContainer = document.querySelector('.chat-container');
    const messageDiv = document.createElement('div');
    
    // Applica classi diverse in base al mittente
    if (sender === 'Tu') {
        messageDiv.className = 'message user-message';
    } else {
        messageDiv.className = 'message assistant-message';
    }
    
    // Crea l'intestazione del messaggio
    const headerDiv = document.createElement('div');
    headerDiv.className = 'user-header';

    if (sender !== 'Tu') {
        headerDiv.className += ' assistant-header';
    }
    headerDiv.textContent = sender;
    messageDiv.appendChild(headerDiv);
    
    // Aggiungi il contenuto del messaggio
    const contentDiv = document.createElement('div');
    
    // Se è in caricamento, aggiungi l'animazione
    if (isLoading) {
        contentDiv.className = 'loading';
        contentDiv.textContent = 'Sto pensando';
    } else {
        // Converti markdown in HTML
        contentDiv.innerHTML = markdownToHtml(text);
    }
    
    messageDiv.appendChild(contentDiv);
    chatContainer.appendChild(messageDiv);
    
    // Scorri in basso per mostrare il messaggio più recente
    chatContainer.scrollTop = chatContainer.scrollHeight;
    
    return messageDiv;
}

// Funzione semplice per convertire markdown in HTML
function markdownToHtml(text) {
    // Converti i blocchi di codice senza linguaggio specificato
    text = text.replace(/```([\s\S]*?)```/g, function(match, code) {
        return `<div class="code-block">
                  <div class="code-header">
                    <span>Codice</span>
                  </div>
                  <div class="code-content">${escapeHtml(code)}</div>
                </div>`;
    });
    
    // Converti il testo in grassetto
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Converti il testo in corsivo
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Converti i link
    text = text.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');
    
    // Converti le interruzioni di riga
    text = text.replace(/\n/g, '<br>');
    
    return text;
}

// Funzione per escapare i caratteri HTML
function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Gestisci l'invio del messaggio
document.getElementById('send').addEventListener('click', () => {
    const input = document.getElementById('input');
    const text = input.value.trim();
    if (!text) return;
    
    // Aggiungi il messaggio dell'utente
    appendMessage('Tu', text);
    
    // Disabilita l'input durante l'elaborazione
    input.disabled = true;
    document.getElementById('send').disabled = true;
    
    // Mostra un messaggio di caricamento
    const loadingMessage = appendMessage('Assistente', '', true);
    
    // Invia il messaggio all'estensione
    vscode.postMessage({ command: 'ask', text });
    input.value = '';
});

// Gestisci la pressione del tasto Invio
document.getElementById('input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        document.getElementById('send').click();
    }
});

// Gestisci i messaggi dall'estensione
window.addEventListener('message', event => {
    const message = event.data;
    
    if (message.command === 'reply') {
        // Rimuovi il messaggio di caricamento se presente
        const loadingMessages = document.querySelectorAll('.loading');
        loadingMessages.forEach(el => {
            el.parentElement.remove();
        });
        
        // Aggiungi la risposta dell'assistente
        appendMessage('Assistente', message.text);
        
        // Riabilita l'input
        document.getElementById('input').disabled = false;
        document.getElementById('send').disabled = false;
        document.getElementById('input').focus();
    }
});

// Imposta il focus sull'input all'avvio
document.getElementById('input').focus();