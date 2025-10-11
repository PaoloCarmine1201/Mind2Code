import * as vscode from 'vscode';
import { promises as fs } from 'fs';

/**
 * Comando per valutare le capacità di programmazione dell'utente
 * attraverso un quiz che aiuta a comprendere il suo livello
 * per adattare il codice generato alle sue competenze.
 */
export async function StartTomQuiz(context) {
  return new Promise(async (resolve) => {
    const userProfile = await getToMProfile(context);
    if (userProfile) {
        vscode.window.showInformationMessage('Profilo utente già creato.');
        resolve(true);
        return;
    }

    const panel = vscode.window.createWebviewPanel(
        'ToMProfileQuiz',
        'Creazione profilo utente',
        vscode.ViewColumn.Two,
        {
            enableScripts: true,
            retainContextWhenHidden: true
        }
    );

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
                // Esporta automaticamente il profilo in JSON
                await exportToMProfileToJson(context);
                panel.dispose();
                resolve(true);
            }
        },
        undefined,
        context.subscriptions
    );

    panel.onDidDispose(async () => {
      const userProfile = await getToMProfile(context);
      if (!userProfile || userProfile.length < 7) {
          vscode.window.showWarningMessage('Devi completare il quiz per continuare.');
          resolve(false)
      } else {
        resolve(true);
      }
    });
  });
}

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
          { value: 'beginner::Principiante (meno di 1 anno), autonomia molto limitata', label: 'Principiante (meno di 1 anno)' },
          { value: 'intermediate::Intermedio (1-3 anni), richiede supporto', label: 'Intermedio (1-3 anni)' },
          { value: 'advanced::Avanzato (3-5 anni), familiarità con librerie e pattern', label: 'Avanzato (3-5 anni)' },
          { value: 'expert::Esperto (5+ anni), progetta, ottimizza e scala sistemi con sicurezza', label: 'Esperto (più di 5 anni)' }
        ])}
        </div>
        
        <div class="section">
        <h2>Quali linguaggi di programmazione conosci meglio?</h2>
        ${renderCheckbox('preferredLanguages', 'Quali linguaggi di programmazione conosci meglio?', [
          { value: 'javascript', label: 'JavaScript/TypeScript' },
          { value: 'python', label: 'Python' },
          { value: 'java', label: 'Java' },
          { value: 'cpp', label: 'C/C++' },
          { value: 'dart', label: 'Dart' },
          { value: 'other', label: 'Altri' }
        ])}
        </div>

        <div class="section">
        <h2>Che livello di complessità del codice preferisci?</h2>
        ${renderRadio('codeComplexity', 'Che livello di complessità del codice preferisci?', [
          { value: 'simple::Semplice, leggibile e didattico, anche se più lungo', label: 'Semplice e facile da capire, anche se più verboso' },
          { value: 'balanced::Bilanciato, equilibrio tra chiarezza e concisione', label: 'Bilanciato tra leggibilità e concisione' },
          { value: 'advanced::Avanzato, include design pattern e strutture moderne', label: 'Avanzato, utilizzando pattern e tecniche moderne' },
          { value: 'optimized::Ottimizzato, performante, ma meno leggibile', label: 'Ottimizzato, anche se più difficile da leggere' }
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
          { value: 'flutter', label: 'Flutter' },
          { value: 'none', label: 'Nessuno/Altri' }
        ])}
        </div>
  
        <div class="section">
        <h2>Quale stile di codice preferisci?</h2>
        ${renderRadio('codeStyle', 'Quale stile di codice preferisci?', [
          { value: 'commented::Molto commentato', label: 'Molto commentato' },
          { value: 'clean::Pulito, nomi descrittivi e struttura ordinata, pochi commenti', label: 'Pulito' },
          { value: 'concise::Conciso, codice compatto', label: 'Conciso' },
          { value: 'documented::Documentato, uso di docstrings, JSDoc o simili per chiarezza', label: 'Ben documentato con JSDoc/docstrings' }
        ])}
        </div>
        
        <div class="section">
        <h2>Qual è il tuo livello di conoscenza dei pattern architetturali?</h2>
        ${renderRadio('architectureKnowledge', 'Qual è il tuo livello di conoscenza dei pattern architetturali?', [
          { value: 'basic::Base', label: 'Base (MVC, singleton)' },
          { value: 'intermediate::Intermedio, usa Repository, Factory, Observer', label: 'Intermedio (repository, factory, observer)' },
          { value: 'advanced::Avanzato, implementa CQRS, microservizi', label: 'Avanzato (CQRS, event sourcing, microservizi)' },
          { value: 'expert::Esperto, architetture complesse e distribuite', label: 'Esperto (architetture complesse e personalizzate)' }
        ])}
        </div>
  
        <div class="section">
        <h2>Come preferisci imparare nuovi concetti di programmazione?</h2>
        ${renderRadio('learningPreference', 'Come preferisci imparare nuovi concetti di programmazione?', [
          { value: 'examples::Esempi, apprende meglio con codice pratico', label: 'Attraverso esempi pratici' },
          { value: 'documentation::Documentazione, preferisce leggere riferimenti e API', label: 'Leggendo documentazione dettagliata' },
          { value: 'tutorials::Tutorial, segue guide passo-passo', label: 'Seguendo tutorial passo-passo' },
          { value: 'exploration::Esplorazione, impara sperimentando liberamente', label: 'Esplorando e sperimentando autonomamente' }
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
export async function getToMProfile(context, suppressWarning = false) {
    const userProfile = await context.globalState.get('tomProfile');

    if ((!userProfile || userProfile.length === 0) || userProfile.length < 7) {
      if (!suppressWarning) {
        vscode.window.showWarningMessage('Profilo utente non trovato oppure incompleto.\n Esegui prima il quiz per configurare o completare il tuo profilo.');
      }
      return;
    }
    
    const profileMap = new Map();
    userProfile.forEach(entry => {
      profileMap.set(entry.id, entry.answer);
    });
    
    const userProfileString = [
      `- Livello di esperienza di programmazione: ${profileMap.get("experienceLevel") || "Non specificato"}`,
      `- Linguaggi di programmazione preferiti: ${formatAnswer(profileMap.get("preferredLanguages"))}`,
      `- Complessità del codice preferita: ${profileMap.get("codeComplexity") || "Non specificato"}`,
      `- Framework con cui l'utente ha esperienza: ${formatAnswer(profileMap.get("frameworkExperience"))}`,
      `- Stile di codifica preferito: ${profileMap.get("codeStyle") || "Non specificato"}`,
      `- Livello di conoscenza dei pattern architetturali: ${profileMap.get("architectureKnowledge") || "Non specificato"}`,
      `- Metodo di apprendimento preferito: ${profileMap.get("learningPreference") || "Non specificato"}`
      ].join("\n");
      
    function formatAnswer(answer) {
      if (!answer) return "Non specificato";
      return Array.isArray(answer) ? answer.join(", ") : answer;
    }
  
    return userProfileString;
  }
  
export async function exportToMProfileToJson (context) {
  try {
    // Recupera i dati del profilo
    const userProfile = await context.globalState.get('tomProfile');
    
    if (!userProfile || userProfile.length === 0 || userProfile.length < 7) {
      vscode.window.showWarningMessage('Profilo utente non trovato oppure incompleto.\n Esegui prima il quiz per configurare o completare il tuo profilo.');
      return false;
    }
    
    // Ottieni la directory di lavoro
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      vscode.window.showErrorMessage('Nessuna directory di lavoro aperta');
      return false;
    }
    
    const currentDir = workspaceFolders[0].uri;
    
    // Crea la cartella out se non esiste
    const outDir = vscode.Uri.joinPath(currentDir, 'out');
    try {
      await vscode.workspace.fs.createDirectory(outDir);
    } catch (err) {
      // La cartella potrebbe già esistere, ignora l'errore
    }
    
    // Crea il file JSON
    const filePath = vscode.Uri.joinPath(outDir, 'user_profile.json');
    
    // Formatta i dati per il JSON
    const jsonData = JSON.stringify(userProfile, null, 2);
    
    // Scrivi il file
    await vscode.workspace.fs.writeFile(
      filePath,
      Buffer.from(jsonData, 'utf8')
    );
    
    vscode.window.showInformationMessage('Profilo utente esportato con successo in out/user_profile.json');
    return true;
  } catch (error) {
    vscode.window.showErrorMessage(`Errore durante l'esportazione del profilo: ${error.message}`);
    return false;
  }
}

export async function clearToMProfile(context) {
    await context.globalState.update('tomProfile', null);
}