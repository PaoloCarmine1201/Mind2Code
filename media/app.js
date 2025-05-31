// @ts-nocheck
const vscode = acquireVsCodeApi();

// Stato della chat
let chatMessages = [];

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

        // Salva il messaggio nello stato (solo se non è un messaggio di caricamento)
        chatMessages.push({ sender, text });
        
        // Salva lo stato nel contesto di VS Code
        vscode.setState({ messages: chatMessages });
    }
    
    messageDiv.appendChild(contentDiv);
    chatContainer.appendChild(messageDiv);
    
    // Scorri in basso per mostrare il messaggio più recente
    chatContainer.scrollTop = chatContainer.scrollHeight;
    
    return messageDiv;
}

// Funzione per ripristinare i messaggi salvati
function restoreMessages() {
    // Ottieni lo stato salvato
    const state = vscode.getState();
    
    // Se ci sono messaggi salvati, ripristinali
    if (state && state.messages && state.messages.length > 0) {
        chatMessages = state.messages;
        
        // Aggiungi i messaggi alla chat
        chatMessages.forEach(msg => {
            appendMessageWithoutSaving(msg.sender, msg.text);
        });
    }
}

// Versione di appendMessage che non salva nuovamente (per evitare duplicati durante il ripristino)
function appendMessageWithoutSaving(sender, text) {
    const chatContainer = document.querySelector('.chat-container');
    const messageDiv = document.createElement('div');
    
    if (sender === 'Tu') {
        messageDiv.className = 'message user-message';
    } else {
        messageDiv.className = 'message assistant-message';
    }
    
    const headerDiv = document.createElement('div');
    headerDiv.className = 'user-header';
    if (sender !== 'Tu') {
        headerDiv.className += ' assistant-header';
    }
    headerDiv.textContent = sender;
    messageDiv.appendChild(headerDiv);
    
    const contentDiv = document.createElement('div');
    contentDiv.innerHTML = markdownToHtml(text);
    messageDiv.appendChild(contentDiv);
    
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Funzione per pulire la chat
function clearChat() {
    // Pulisci l'array dei messaggi
    chatMessages = [];
    
    // Salva lo stato vuoto
    vscode.setState({ messages: chatMessages });
    
    // Pulisci l'interfaccia utente
    const chatContainer = document.querySelector('.chat-container');
    chatContainer.innerHTML = '';
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

    if (text === 'si' || text === 'sì' || text === 'yes' || text === 's' || text === 'no' || text === 'n') {
        document.getElementById('confirmation-buttons').innerHTML = '';
    }
    
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

    if (message.command === 'askConfirmation') {
        appendMessage('Assistente', message.text);
        showConfirmationButtons(message.options);
    }
    
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
    } else if (message.command === 'tool_output') {
        // Rimuovi il messaggio di caricamento se presente
        const loadingMessages = document.querySelectorAll('.loading');
        loadingMessages.forEach(el => {
            el.parentElement.remove();
        });
        // Personalizza la risposta in base al tool
    let text = message.text;
    const toolName = message.toolName;

    if (toolName === 'is_requirement') {
        if (text.includes('true')) {
            text = "Sì, questo è un requisito! Continuiamo con il prossimo passo.";
        } else if (text.includes('false')) {
            text = "Non sembra un requisito. Vuoi riprovare o chiedere altro?";
        }
    } else if (toolName === 'classify_language') {
        text = `Ho individuato il linguaggio migliore per questo requisito: <strong>${text}</strong>. Procedo!`;
    } else if (toolName === 'extract_filename') {
        text = `Ho scelto questo nome file per te: <strong>${text}</strong>. Passo alla generazione del codice!`;
    } else if (toolName === 'generate_code') {
        console.log('Codice generato:', text);
        text = markdownToHtml(text);
    } else if (toolName === 'save_code') {
        text = "Codice salvato con successo! Se vuoi, puoi fare un'altra richiesta.";
    }
        appendMessage('Tool', text);
    } else if (message.command === 'clearChat') {
        // Comando per pulire la chat
        clearChat();
    }
});

// Funzione per mostrare i bottoni
function showConfirmationButtons(options) {
    const btnContainer = document.getElementById('confirmation-buttons');
    btnContainer.innerHTML = '';

    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.textContent = opt.label;
        btn.className = 'confirmation-btn';

        // Aggiungi un'icona in base al valore
        if (opt.value === 'si') btn.textContent = '✅ ' + opt.label;
        if (opt.value === 'no') btn.textContent = '❌ ' + opt.label;

        btn.onclick = () => {
            // Mostra in chat la scelta dell'utente
            appendMessage('Tu', opt.label);
            vscode.postMessage({ command: 'ask', text: opt.value });
            btnContainer.innerHTML = '';
        };
        btnContainer.appendChild(btn);
    });
}

// Funzioni di supporto da riagganciare
function sendMessage() {
    const input = document.getElementById('input');
    const text = input.value.trim();
    if (!text) return;
    appendMessage('Tu', text);
    input.disabled = true;
    document.getElementById('send').disabled = true;
    const loadingMessage = appendMessage('Assistente', '', true);
    vscode.postMessage({ command: 'ask', text });
    input.value = '';
}

function handleKeyPress(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        document.getElementById('send').click();
    }
}

// Ripristina i messaggi all'avvio
document.addEventListener('DOMContentLoaded', () => {
    restoreMessages();
});

// Imposta il focus sull'input all'avvio
document.getElementById('input').focus();