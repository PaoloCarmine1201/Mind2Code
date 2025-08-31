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
    } else if (sender === 'Tool') {
        messageDiv.className = 'message tool-message';
    } else if (sender === 'InfoTomProfile'){
        messageDiv.className = 'message info-tom-message';
    } else if (sender === 'InfoRepository') {
        messageDiv.className = 'message info-repo-message';
    } else {
        messageDiv.className = 'message assistant-message';
    }

    
    // Crea l'intestazione del messaggio
    const headerDiv = document.createElement('div');
    if (sender === 'Tu') {
        headerDiv.className = 'user-header';
        headerDiv.textContent = 'Tu';
    } else if (sender === 'Tool') {
        headerDiv.className = 'tool-header';
        headerDiv.textContent = '🛠️ Tool';
    } else if (sender === 'InfoTomProfile') {
        headerDiv.className = 'info-tom-header';
        headerDiv.textContent = '🧠 Profilo Utente';
    } else if (sender === 'InfoRepository') {
        headerDiv.className = 'info-repo-header';
        headerDiv.textContent = '📦 Contesto Repository';
    } else {
        headerDiv.className = 'assistant-header';
        headerDiv.textContent = '🤖 Assistente';
    }
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
    
    // Applica classi diverse in base al mittente
    if (sender === 'Tu') {
        messageDiv.className = 'message user-message';
    } else if (sender === 'Tool') {
        messageDiv.className = 'message tool-message';
    } else if (sender === 'InfoTomProfile'){
        messageDiv.className = 'message info-tom-message';
    } else if (sender === 'InfoRepository') {
        messageDiv.className = 'message info-repo-message';
    } else {
        messageDiv.className = 'message assistant-message';
    }

    
    // Crea l'intestazione del messaggio
    const headerDiv = document.createElement('div');
    if (sender === 'Tu') {
        headerDiv.className = 'user-header';
        headerDiv.textContent = 'Tu';
    } else if (sender === 'Tool') {
        headerDiv.className = 'tool-header';
        headerDiv.textContent = '🛠️ Tool';
    } else if (sender === 'InfoTomProfile') {
        headerDiv.className = 'info-tom-header';
        headerDiv.textContent = '🧠 Profilo Utente';
    } else if (sender === 'InfoRepository') {
        headerDiv.className = 'info-repo-header';
        headerDiv.textContent = '📦 Contesto Repository';
    } else {
        headerDiv.className = 'assistant-header';
        headerDiv.textContent = '🤖 Assistente';
    }
    messageDiv.appendChild(headerDiv);
    
    const contentDiv = document.createElement('div');
    contentDiv.innerHTML = markdownToHtml(text);
    messageDiv.appendChild(contentDiv);
    
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Funzione per pulire la chat
function clearChat() {
    // Salva il messaggio del contesto repository se esiste
    const repoContextMessage = chatMessages.find(msg => msg.sender === 'InfoRepository');
    
    // Pulisci l'array dei messaggi
    chatMessages = [];
    
    // Ripristina il messaggio del contesto repository se esisteva
    if (repoContextMessage) {
        chatMessages.push(repoContextMessage);
    }
    
    // Salva lo stato aggiornato
    vscode.setState({ messages: chatMessages });
    
    // Pulisci l'interfaccia utente
    const chatContainer = document.querySelector('.chat-container');
    chatContainer.innerHTML = '';
    
    // Ripristina il messaggio del contesto repository nell'interfaccia se esisteva
    if (repoContextMessage) {
        appendMessageWithoutSaving(repoContextMessage.sender, repoContextMessage.text);
    }
}

// Funzione semplice per convertire markdown in HTML
function markdownToHtml(text) {
    // Converti i blocchi di codice senza linguaggio specificato
    text = text.replace(/```([\s\S]*?)```/g, function(match, code) {
        return `<div class="code-block">
                  <div class="code-header">
                    <span>Codice generato</span>
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

//funzione che elimina i messaggi di caricamento
function removeLoadingMessages() {
    const loadingMessages = document.querySelectorAll('.loading');
    loadingMessages.forEach(el => {
        el.parentElement.remove();
    });
}

// Gestisci i messaggi dall'estensione
window.addEventListener('message', event => {
    const message = event.data;

    if (message.command === 'loading') {
        // Rimuovi eventuali messaggi di caricamento esistenti
        removeLoadingMessages();
        
        // Aggiungi un nuovo messaggio di caricamento
        appendMessage('Assistente', '', true);
    }

    if (message.command === 'repoContext') {
        removeLoadingMessages();
        // Aggiungi il contesto della repository
        const ctx = message.text;
        const namingStyle =
        ctx.namingExamples?.controllers?.[0]?.namingStyle ||
        ctx.namingExamples?.services?.[0]?.namingStyle ||
        'camelCase';

        const text = `
                📦 Repository **${ctx.repo}** di ${ctx.owner}

                • Linguaggi: ${ctx.languages.join(', ')}
                • Framework: ${ctx.framework.join(', ')}
                • Configurazione: ${ctx.configFiles.join(', ')}
                • Naming Style: ${namingStyle.join(', ')}

                🧠 Userò queste informazioni per guidare le mie scelte (es. convenzioni di naming, struttura del file, ecc.)
        `.trim();

        const sender = 'InfoRepository';
        appendMessage(sender, text);
    }

    if (message.command === 'updateRepoContext') {
        // Rimuovi il vecchio messaggio del contesto repository
        const oldRepoContextIndex = chatMessages.findIndex(msg => msg.sender === 'InfoRepository');
        if (oldRepoContextIndex !== -1) {
            chatMessages.splice(oldRepoContextIndex, 1);
        }
        
        // Rimuovi il vecchio messaggio dall'interfaccia
        const oldRepoContextElements = document.querySelectorAll('.info-repo-message');
        oldRepoContextElements.forEach(el => el.remove());
        
        // Aggiungi il nuovo contesto della repository
        const ctx = message.text;
        const namingStyle =
        ctx.namingExamples?.controllers?.[0]?.namingStyle ||
        ctx.namingExamples?.services?.[0]?.namingStyle ||
        'camelCase';
        console.log('Aggiornamento contesto della repository:', ctx);

        const text = `
                📦 Repository **${ctx.repo}** di ${ctx.owner}

                • Linguaggi: ${ctx.languages.join(', ')}
                • Framework: ${ctx.framework.join(', ')}
                • Configurazione: ${ctx.configFiles.join(', ')}
                • Naming Style: ${namingStyle}

                🧠 Userò queste informazioni per guidare le mie scelte (es. convenzioni di naming, struttura del file, ecc.)
        `.trim();

        const sender = 'InfoRepository';
        appendMessage(sender, text);
    }

    if (message.command === 'showToMProfile') {
        removeLoadingMessages();
        const profile = message.text;

        const lines = profile
            .split(/\n| - /)
            .map(line => line.trim())
            .filter(line => line.includes(':'));

        let text = `
            🧠 <strong>Profilo Utente</strong><br>
            <ul style="margin-top:8px; padding-left: 1.2em;">
        `;
        lines.forEach(line => {
            const colonIndex = line.indexOf(':');
            if (colonIndex !== -1) {
                let label = line.slice(0, colonIndex).trim();
                let value = line.slice(colonIndex + 1).trim();

                // Rimuovi eventuale trattino iniziale dalla label
                if (label.startsWith('-')) {
                    label = label.slice(1).trim();
                }

                // Prendi solo la parte prima di "::" se presente
                const doubleColonIndex = value.indexOf('::');
                if (doubleColonIndex !== -1) {
                    value = value.slice(0, doubleColonIndex).trim();
                }

                if (label && value) {
                    text += `<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</li>`;
                }
            }
        });
        text += '</ul>';

        appendMessage('InfoTomProfile', text);
    }




    if (message.command === 'askConfirmation') {
        appendMessage('Assistente', message.text);
        showConfirmationButtons(message.options);
    }

    if(message.command === 'askForFollowup') {
        appendMessage('Assistente', message.text);
        showConfirmationButtonsFollowup(message.options);
    }
    
    if (message.command === 'initialMessage') {
        // Rimuovi eventuali messaggi di caricamento
        removeLoadingMessages();

        // Aggiungi il messaggio iniziale dell'assistente
        appendMessage('Assistente', "La tua richiesta iniziale è stata ricevuta. "+
            "\nIniziamo controllando che il requisito inviato sia valido.\n"+
            "La tua richiesta è: " + message.text);
    }
    if (message.command === 'reply') {
        // Rimuovi il messaggio di caricamento se presente
        removeLoadingMessages();
        
        // Aggiungi la risposta dell'assistente
        appendMessage('Assistente', message.text);
        
        // Riabilita l'input
        document.getElementById('input').disabled = false;
        document.getElementById('send').disabled = false;
        document.getElementById('input').focus();
    } else if (message.command === 'tool_output') {
        // Rimuovi il messaggio di caricamento se presente
        removeLoadingMessages();

        // Personalizza la risposta in base al tool
        let text = message.text;
        const toolName = message.toolName;

        if (toolName === 'is_requirement') {
            if (text.includes('true')) {
                text = "<strong>Sì</strong>, questo è un requisito! Continuiamo con il prossimo passo.";
            } else if (text.includes('false')) {
                text = "<strong>Non sembra un requisito</strong>. Vuoi riprovare o chiedere altro?";
            }
        appendMessage('Tool', text);
        } else if (toolName === 'classify_language') {
            text = `Ho individuato il linguaggio migliore per questo requisito: <strong>${text}</strong>. Procedo!`;
            appendMessage('Tool', text);
        } else if (toolName === 'extract_filename') {
            text = `Ho scelto questo nome file per te: <strong>${text}</strong>. Passo alla generazione del codice!`;
            appendMessage('Tool', text);
        } else if (toolName === 'generate_code') {
            console.log('Codice generato:', text);
            text = markdownToHtml(text);
            appendMessage('Tool', text);
        } else if (toolName === 'propose_followup') {
           let parsed;
            try {
                parsed = typeof text === "string" ? JSON.parse(text) : text;
            } catch (e) {
                console.error("❌ Errore nel parsing del followup:", e);
                return;
            }

            const followupText = parsed.followup;
            console.log("Sono in followUp:", followupText);

            appendMessage("Tool", followupText);
        } else if (toolName === 'implement_improvement') {
            console.log('Codice migliorato:', text);
            text = markdownToHtml(text);
            appendMessage('Tool', text);
        } else if (toolName === 'save_code') {
            text = "Codice salvato con successo! Qui sulla tua destra puoi vedere il file generato.";
            appendMessage('Tool', text);
        } else if (toolName === 'refine_requirement') {
            console.log("Sono entrato nel fantastico IF")
            try {
                // 1. Parsing del risultato JSON interno
                const outer = JSON.parse(text); // ora outer.requirement è una stringa JSON
                const parsed = JSON.parse(outer.requirement); // ora è un oggetto con user_story e criteria

                // 2. Costruzione del messaggio markdown
                let formatted = `🛠️ Ho formattato il requisito per te:\n\n`;
                formatted += `**📌 User Story**\n`;
                formatted += `- ${parsed.user_story}\n\n`;
                formatted += `**✅ Acceptance Criteria**\n`;
                parsed.acceptance_criteria.forEach((ac, index) => {
                    formatted += `- ${ac}\n`;
                });
                formatted += `\n➡️ Procediamo con questa nuova user story.`;

                // 3. Conversione markdown → HTML + append
                const html = markdownToHtml(formatted);
                appendMessage('Tool', html);

            } catch (err) {
                console.error("Errore nel parsing del requirement:", err);
                appendMessage('Tool', "⚠️ Errore durante la formattazione del requisito.");
            }
        }

        } else if (message.command === 'clearChat') {
            // Comando per pulire la chat
            clearChat();
        }
});

// Funzione per mostrare i bottoni per le domande di followup
function showConfirmationButtonsFollowup(options) {
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
            vscode.postMessage({ command: 'askFollowUp', text: opt.value });
            btnContainer.innerHTML = '';
        };
        btnContainer.appendChild(btn);
    });
}

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