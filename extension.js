// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { ChatViewProvider } from './src/provider/chatViewProvider.js';
import { resetAgent } from './src/agente/agent.js';
import { createGithubContext, getGithubContext, clearGithubContext } from './src/commands/githubContextCommand.js';
import { StartTomQuiz, getToMProfile, clearToMProfile } from './src/commands/TheoryOfMindCommand.js';
import { configureMind2Code, printConfigurationStatus, getApiKey, getModel, flushConfiguration, getGithubToken } from './src/commands/configureMind2CodeCommand.js';
import { initializeLlm } from './src/agente/AgentModel.js';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
export async function activate(context) {
	const chatViewProvider = new ChatViewProvider(context.extensionUri, context);
	// Registra il provider
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('Mind2CodeView', chatViewProvider)
	);

	const commands = [
		{ 
		  name: 'Mind2Code.clearChat', 
		  callback: () => chatViewProvider.clearChat()
		},
		{ 
		  name: 'Mind2Code.createGithubContext', 
		  callback: async () => {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			if (!workspaceFolder) {
			  vscode.window.showErrorMessage("Nessuna cartella di workspace attiva.");
			  return;
			}
			const newRepoContext = await createGithubContext(workspaceFolder, context);
			vscode.window.showInformationMessage('Profilo della repository salvato con successo.');

			// Aggiorna il contesto della repository nella chat
			chatViewProvider.updateRepoContext(newRepoContext);
		  } 
		},
		{
		  name: 'Mind2Code.getGithubContext', 
		  callback: async () => {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			if (workspaceFolder) {
			const repoContext = await getGithubContext(workspaceFolder, context);
				if (repoContext) {
					// Aggiorna il messaggio del contesto repository
					vscode.window.showInformationMessage(`Owner: ${repoContext.owner}, Repo: ${repoContext.repo}`);
					chatViewProvider.updateRepoContext(repoContext);
				} else {
					vscode.window.showErrorMessage('Nessun profilo della repository trovato.');
				}
			}
		  }
		},
		{ 
		  name: 'Mind2Code.clearGithubContext', 
		  callback: async () => {
			if (await clearGithubContext(context)){
				vscode.window.showInformationMessage('Profilo della repository eliminato.');
			} else {
				vscode.window.showErrorMessage('Errore durante l\'eliminazione del profilo della repository.');
			}
		  } 
		},
		{ 
			name: 'Mind2Code.refreshExtension', 
			callback: async () => {
			  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			  if (!workspaceFolder) {
				vscode.window.showErrorMessage("Nessuna cartella di workspace attiva.");
				return;
			  }
			  
			  // Mostra notifica di inizio refresh
			  vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: "Aggiornamento estensione in corso",
				cancellable: false
			  }, async (progress) => {
				progress.report({ increment: 0, message: "Pulizia contesto precedente..." });
				
				// Pulisci il contesto GitHub esistente
				await clearGithubContext(context);
				
				progress.report({ increment: 30, message: "Creazione nuovo contesto GitHub..." });
				
				// Crea un nuovo contesto GitHub
				const repoContext = await createGithubContext(workspaceFolder, context);
				
				progress.report({ increment: 30, message: "Reset dell'agente..." });
				
				// Reset dell'agente
				resetAgent();
				
				progress.report({ increment: 30, message: "Pulizia chat..." });
				
				// Pulisci la chat
				chatViewProvider.clearChat();

				// Invia il nuovo contesto della repository
				chatViewProvider.updateRepoContext(repoContext);
				
				progress.report({ increment: 10, message: "Completato!" });
				
				// Mostra messaggio di successo
				vscode.window.showInformationMessage('Estensione aggiornata con successo. Nuovo contesto GitHub caricato.');
				
				return repoContext;
			  });
			}
		},
		{
			name: 'Mind2Code.startToMProfileQuiz',
			callback: () => {
			  StartTomQuiz(context);
			}
		},
		{
			name: 'Mind2Code.getToMProfile',
			callback: async () => {
			  const profile = await getToMProfile(context);
			  if (profile) {
				chatViewProvider.sendToMProfileToChat(profile);
			  } else {
				vscode.window.showErrorMessage('Nessun profilo ToM trovato.');
			  }
			}
		},
		{
			name: 'Mind2Code.clearToMProfile',
			callback: async () => {
			  await clearToMProfile(context);
			  vscode.window.showInformationMessage('Profilo ToM eliminato con successo.');
			}
		},
		{
			name: 'Mind2Code.configureMind2Code',
			callback: async () => {
				await configureMind2Code(context);
			}
		},
		{
			name: 'Mind2Code.restartConfiguration',
			callback: async () => {
				await flushConfiguration(context);
				//Mostra messaggio di avvenuta cancellazione configurazione
				vscode.window.showInformationMessage('Configurazione cancellata con successo.');
				// Ricarica la finestra di VS Code per riavviare l'estensione
				vscode.commands.executeCommand('workbench.action.reloadWindow');
			}
		},
		{
			name: 'Mind2Code.getConfigurationStatus',
			callback: async () => {
				await printConfigurationStatus(context);
			}
		},
	  ];

	  commands.forEach(({ name, callback }) => {
		const disposable = vscode.commands.registerCommand(name, callback);
		context.subscriptions.push(disposable);
	  });

	// --- PRIMO CICLO: CONFIGURAZIONE MIND2CODE (API Key, Modello, GitHub Token) ---
	let isMind2CodeConfigured = false;
	while (!isMind2CodeConfigured) {
		const apiKey = await getApiKey(context);
		const model = await getModel(context);
		const githubToken = await getGithubToken(context);

		if (!apiKey || !model || !githubToken) { // Controlla tutti i campi richiesti
			const selection = await vscode.window.showErrorMessage(
				"Mind2Code: API Key, Modello o GitHub Token non configurati. Si prega di configurare Mind2Code.",
				"Configura Ora"
			);
			if (selection === "Configura Ora") {
				const configCompleted = await vscode.commands.executeCommand('Mind2Code.configureMind2Code');
				if (!configCompleted) {
					await new Promise(res => setTimeout(res, 2000));
				}
			} else {
				vscode.window.showWarningMessage("L'estensione Mind2Code richiede la configurazione per funzionare correttamente. Il messaggio verrà riproposto.");
				await new Promise(res => setTimeout(res, 3000));
			}
		} else {
			isMind2CodeConfigured = true;
		}
	}

	// --- SECONDO CICLO: CONFIGURAZIONE PROFILO TOM ---
	let isTomProfileConfigured = false;
	let isTomQuizPanelOpen = false; // Variabile di stato per il pannello
	while (!isTomProfileConfigured) {
		const tomProfile = await getToMProfile(context, true); // Passa true per sopprimere l'avviso

		if (!tomProfile) { // Controlla se il profilo ToM è configurato
			// Mostra il messaggio di errore solo se il pannello del quiz non è già aperto
			if (!isTomQuizPanelOpen) {
				const selection = await vscode.window.showErrorMessage(
					"Mind2Code: Profilo ToM non configurato. Si prega di completare il quiz ToM.",
					"Avvia Quiz ToM"
				);
				if (selection === "Avvia Quiz ToM") {
					isTomQuizPanelOpen = true; // Imposta lo stato a true quando il quiz viene avviato
					const quizCompleted = await StartTomQuiz(context); // Usa direttamente StartTomQuiz invece del comando
					isTomQuizPanelOpen = false; // Reimposta lo stato a false quando il quiz è completato o chiuso

					if (quizCompleted) { // Se il quiz è stato completato con successo
						isTomProfileConfigured = true; // Esci dal ciclo
					} else {
						await new Promise(res => setTimeout(res, 2000));
					}
				} else {
					vscode.window.showWarningMessage("L'estensione Mind2Code richiede il profilo ToM per funzionare correttamente. Il messaggio verrà riproposto.");
					await new Promise(res => setTimeout(res, 3000));
				}
			} else {
				// Se il pannello del quiz è già aperto, attendi più tempo prima di ricontrollare
				await new Promise(res => setTimeout(res, 5000)); // Aumentato il timeout a 5 secondi
			}
		} else {
			isTomProfileConfigured = true;
		}
	}

	initializeLlm(context);
/*
	let tomProfile = null;
	setTimeout(async () => {
		tomProfile = await getToMProfile(context);
		if (tomProfile === null || !tomProfile || tomProfile === undefined) {
			// Se non esiste un profilo ToM, avvia il quiz
			StartTomQuiz(context);
		}
	}, 1000);
*/

	setTimeout(async() => {
		// Ottieni il contesto della repository
		chatViewProvider.clearChat();
	}, 1000);

	  // Pulisci la chat all'avvio dell'estensione
		(async () => {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		if (workspaceFolder) {
			let repoContext = null;
			
			// Ciclo che controlla ogni 15 secondi finché non ottiene un repoContext valido
			while (!repoContext) {
				repoContext = await getGithubContext(workspaceFolder, context);
				if (repoContext) {
					// Pulisci la chat ma mantieni il messaggio del contesto repository
					chatViewProvider.clearChat();
					// Aggiorna il messaggio del contesto repository
					chatViewProvider.updateRepoContext(repoContext);
					break; // Esce dal ciclo quando ha un valore valido
				} else {
					await new Promise(res => setTimeout(res, 1000));
				}
			}
		}
	})();

}

// This method is called when your extension is deactivated
export function deactivate() {}

