import * as vscode from 'vscode';

/**
 * Comando per valutare le capacità di programmazione dell'utente
 * attraverso un quiz che aiuta a comprendere il suo livello
 * per adattare il codice generato alle sue competenze.
 */
export async function StartTomQuiz(context) {
    const userProfile = await getToMProfile(context);
    if (userProfile) {
        vscode.window.showInformationMessage('Profilo utente già creato.');
        return;
    }

    // Crea un pannello webview sulla destra
    const panel = vscode.window.createWebviewPanel(
        'ToMProfileQuiz',
        'Creazione profilo utente',
        vscode.ViewColumn.Two,
        {
            enableScripts: true,
            retainContextWhenHidden: true
        }
    );

    // Ottieni il percorso del file CSS per lo stile
    const styleUri = panel.webview.asWebviewUri(
        vscode.Uri.joinPath(context.extensionUri, 'media', 'tom.css')
    );

    panel.webview.html = getHtml(panel.webview, context, styleUri);

    // Gestione dei messaggi dal webview
    panel.webview.onDidReceiveMessage(
        async (message) => {
            if (message.command === "quizResponse") {
              const { id, question, answer } = message.value;
              await saveAnswer(context, id, question, answer);
            } else if (message.command === "quizComplete") {
                vscode.window.showInformationMessage('Profilo utente salvato con successo!');
                panel.dispose(); // Chiude il pannello dopo il salvataggio
            }
        },
        undefined,
        context.subscriptions
    );
}
//TODO: Cambiare il value dei radio e checkbox in modo che siano più comprensibili per l'utente, ad esempio: "beginner" -> "Principiante (meno di 1 anno)"
function getHtml(webview, context, styleUri) {
    return `
      <!DOCTYPE html>
      <html lang="it">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Creazione profilo utente</title>
        <link href="${styleUri}" rel="stylesheet" />
      </head>
      <body>
        <h1>🧠 Creazione profilo Utente</h1>
        <p>Ciao programmatore! <br>Rispondi alle seguenti domande per aiutarci a personalizzare il codice generato in base alle tue competenze e preferenze.</p>

        <div class="section">
        <h2>Qual è il tuo livello di esperienza nella programmazione?</h2>
        ${renderRadio('experienceLevel', 'Qual è il tuo livello di esperienza nella programmazione?', [
          { value: 'beginner::Principiante (meno di 1 anno) - autonomia molto limitata', label: 'Principiante (meno di 1 anno)' },
          { value: 'intermediate::Intermedio (1-3 anni) - richiede supporto', label: 'Intermedio (1-3 anni)' },
          { value: 'advanced::Avanzato (3-5 anni) - familiarità con librerie e pattern', label: 'Avanzato (3-5 anni)' },
          { value: 'expert::Esperto (5+ anni) - progetta, ottimizza e scala sistemi con sicurezza', label: 'Esperto (più di 5 anni)' }
        ])}
        </div>
        
        <div class="section">
        <h2>Quali linguaggi di programmazione conosci meglio?</h2>
        ${renderCheckbox('preferredLanguages', 'Quali linguaggi di programmazione conosci meglio?', [
          { value: 'javascript', label: 'JavaScript/TypeScript' },
          { value: 'python', label: 'Python' },
          { value: 'java', label: 'Java' },
          { value: 'cpp', label: 'C/C++' },
          { value: 'other', label: 'Altri' }
        ])}
        </div>

        <div class="section">
        <h2>Che livello di complessità del codice preferisci?</h2>
        ${renderRadio('codeComplexity', 'Che livello di complessità del codice preferisci?', [
          { value: 'simple::Semplice - leggibile e didattico, anche se più lungo', label: 'Semplice e facile da capire, anche se più verboso' },
          { value: 'balanced::Bilanciato - equilibrio tra chiarezza e concisione', label: 'Bilanciato tra leggibilità e concisione' },
          { value: 'advanced::Avanzato - include design pattern e strutture moderne', label: 'Avanzato, utilizzando pattern e tecniche moderne' },
          { value: 'optimized::Ottimizzato - performante, ma meno leggibile', label: 'Ottimizzato, anche se più difficile da leggere' }
        ])}
        </div>
        
        <div class="section">
        <h2>Con quali framework hai esperienza?</h2>
        ${renderCheckbox('frameworkExperience', 'Con quali framework hai esperienza?', [
          { value: 'react', label: 'React' },
          { value: 'angular', label: 'Angular' },
          { value: 'node', label: 'Node' },
          { value: 'django', label: 'Django' },
          { value: 'flask', label: 'Flask' },
          { value: 'spring', label: 'Spring' },
          { value: 'none', label: 'Nessuno/Altri' }
        ])}
        </div>
  
        <div class="section">
        <h2>Quale stile di codice preferisci?</h2>
        ${renderRadio('codeStyle', 'Quale stile di codice preferisci?', [
          { value: 'commented::Molto commentato', label: 'Molto commentato' },
          { value: 'clean::Pulito - nomi descrittivi e struttura ordinata, pochi commenti', label: 'Pulito' },
          { value: 'concise::Conciso - codice compatto', label: 'Conciso' },
          { value: 'documented::Documentato - uso di docstrings, JSDoc o simili per chiarezza', label: 'Ben documentato con JSDoc/docstrings' }
        ])}
        </div>
        
        <div class="section">
        <h2>Qual è il tuo livello di conoscenza dei pattern architetturali?</h2>
        ${renderRadio('architectureKnowledge', 'Qual è il tuo livello di conoscenza dei pattern architetturali?', [
          { value: 'basic::Base', label: 'Base (MVC, singleton)' },
          { value: 'intermediate::Intermedio - usa Repository, Factory, Observer', label: 'Intermedio (repository, factory, observer)' },
          { value: 'advanced::Avanzato - implementa CQRS, microservizi', label: 'Avanzato (CQRS, event sourcing, microservizi)' },
          { value: 'expert::Esperto - architetture complesse e distribuite', label: 'Esperto (architetture complesse e personalizzate)' }
        ])}
        </div>
  
        <div class="section">
        <h2>Come preferisci imparare nuovi concetti di programmazione?</h2>
        ${renderRadio('learningPreference', 'Come preferisci imparare nuovi concetti di programmazione?', [
          { value: 'examples::Esempi - apprende meglio con codice pratico', label: 'Attraverso esempi pratici' },
          { value: 'documentation::Documentazione - preferisce leggere riferimenti e API', label: 'Leggendo documentazione dettagliata' },
          { value: 'tutorials::Tutorial - segue guide passo-passo', label: 'Seguendo tutorial passo-passo' },
          { value: 'exploration::Esplorazione - impara sperimentando liberamente', label: 'Esplorando e sperimentando autonomamente' }
        ])}
        </div>
  
        <div>
            <button id="saveButton" disabled onclick="saveQuiz()">Salva Profilo</button>
            <div id="confirmation">Profilo utente salvato!</div>
        </div>
  
        <script>
            const vscode = acquireVsCodeApi();

            const questionIds = [
                "experienceLevel",
                "preferredLanguages",
                "codeComplexity",
                "frameworkExperience",
                "codeStyle",
                "architectureKnowledge",
                "learningPreference"
            ];

            const answeredQuestions = new Set();

            function sendAnswer(questionId, questionLabel) {
                const inputs = document.querySelectorAll("input[name='" + questionId + "']");
                const checked = Array.from(inputs).filter(input => input.checked);
                if (!checked.length) return;

                const isRadio = inputs[0].type === "radio";
                const answer = isRadio ? checked[0].value : checked.map(i => i.value);

                vscode.postMessage({
                  command: "quizResponse",
                  value: {
                    id: questionId,
                    question: questionLabel,
                    answer
                  }
                });

                // Registra la risposta e verifica
                answeredQuestions.add(questionId);
                checkAllAnswered();
            }

            function checkAllAnswered() {
                const saveButton = document.getElementById("saveButton");
                if (answeredQuestions.size === questionIds.length) {
                saveButton.disabled = false;
                }
            }

            function saveQuiz() {
                vscode.postMessage({ command: "quizComplete" });
                document.getElementById("confirmation").style.display = "block";
            }
        </script>

      </body>
      </html>
    `;
  
    // Helpers per generare i blocchi HTML
    function renderRadio(name, label, options) {
      return options.map(opt => `
        <label>
          <input type="radio" name="${name}" value="${opt.value}" onchange="sendAnswer('${name}', '${label}')" />
          ${opt.label}
        </label>
      `).join("\n");
    }
  
    function renderCheckbox(name, label, options) {
      return options.map(opt => `
        <label>
          <input type="checkbox" name="${name}" value="${opt.value}" onchange="sendAnswer('${name}', '${label}')" />
          ${opt.label}
        </label>
      `).join("\n");
    }
  }
  

// Funzione per salvare la risposta dell'utente nel globalState
async function saveAnswer(context, id, question, answer) {
  let savedAnswers = context.globalState.get("tomProfile") || [];

  const existingIndex = savedAnswers.findIndex(entry => entry.id === id);

  if (existingIndex !== -1) {
    savedAnswers[existingIndex].answer = answer;
    savedAnswers[existingIndex].question = question;
  } else {
    savedAnswers.push({ id, question, answer });
  }

  await context.globalState.update("tomProfile", savedAnswers);
}

/**
 * Recupera il profilo utente dal contesto dell'estensione
 */
export async function getToMProfile(context) {
    const userProfile = await context.globalState.get('tomProfile');
    //Trasformare userProfile in un oggetto JSON
    console.log("Profilo utente trovato: " + JSON.stringify(userProfile, null, 2));

    if (!userProfile || userProfile.length === 0) {
      vscode.window.showWarningMessage('Profilo utente non trovato. Esegui prima il quiz per configurare il tuo profilo.');
      return;
    }
  
    if (userProfile.length < 7) {
      vscode.window.showWarningMessage('Profilo utente incompleto. Esegui nuovamente il quiz per completare il tuo profilo.');
      return;
    }
  
    const getAnswer = (index) => {
      const answer = userProfile[index]?.answer;
      if (!answer) return "Non specificato";
  
      return Array.isArray(answer) ? answer.join(", ") : answer;
    };

    const profileMap = new Map();
    userProfile.forEach(entry => {
      profileMap.set(entry.id, entry.answer);
    });
    
    const userProfileString = [
      `- Programming experience level: ${profileMap.get("experienceLevel") || "Non specificato"}`,
      `- Preferred programming languages: ${formatAnswer(profileMap.get("preferredLanguages"))}`,
      `- Preferred code complexity: ${profileMap.get("codeComplexity") || "Non specificato"}`,
      `- Frameworks the user has experience with: ${formatAnswer(profileMap.get("frameworkExperience"))}`,
      `- Preferred coding style: ${profileMap.get("codeStyle") || "Non specificato"}`,
      `- Knowledge level of architectural patterns: ${profileMap.get("architectureKnowledge") || "Non specificato"}`,
      `- Preferred learning method: ${profileMap.get("learningPreference") || "Non specificato"}`
      ].join("\n");
      
    function formatAnswer(answer) {
      if (!answer) return "Non specificato";
      return Array.isArray(answer) ? answer.join(", ") : answer;
    }
  
    console.log("STAMPO PROFILO " + userProfileString);
    return userProfileString;
  }
  

export async function clearToMProfile(context) {
    await context.globalState.update('tomProfile', null);
}