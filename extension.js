// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { ChatViewProvider } from './src/provider/chatViewProvider.js';
import { resetAgent } from './src/agente/agent.js';
import { createGithubContext, getGithubContext, clearGithubContext } from './src/commands/githubContextCommand.js';
import { StartTomQuiz, getToMProfile, clearToMProfile } from './src/commands/TheoryOfMindCommand.js';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
export function activate(context) {
	let tomProfile = null;
	setTimeout(async () => {
		tomProfile = await getToMProfile(context);
		if (tomProfile === null || !tomProfile || tomProfile === undefined) {
			// Se non esiste un profilo ToM, avvia il quiz
			StartTomQuiz(context);
		}
	}, 1000);

	const chatViewProvider = new ChatViewProvider(context.extensionUri, context);
	// Registra il provider
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('Mind2CodeView', chatViewProvider)
	);

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

	const commands = [
		{ 
		  name: 'Mind2Code.clearChat', callback: () => chatViewProvider.clearChat()
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
				vscode.window.showInformationMessage(`Profilo ToM: ${profile}`);
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
		}
	  ];

	  commands.forEach(({ name, callback }) => {
		const disposable = vscode.commands.registerCommand(name, callback);
		context.subscriptions.push(disposable);
	  });

}

// This method is called when your extension is deactivated
export function deactivate() {}

