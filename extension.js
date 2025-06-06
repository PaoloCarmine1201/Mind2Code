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
		vscode.window.registerWebviewViewProvider('openaiChatView', chatViewProvider)
	);

	  // Pulisci la chat all'avvio dell'estensione
	// Utilizziamo setTimeout per assicurarci che la webview sia completamente caricata
	setTimeout(async() => {
		// Ottieni il contesto della repository
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		if (workspaceFolder) {
			const repoContext = await getGithubContext(workspaceFolder, context);
			if (repoContext) {
				// Pulisci la chat ma mantieni il messaggio del contesto repository
				chatViewProvider.clearChat();
				// Aggiorna il messaggio del contesto repository
				chatViewProvider.updateRepoContext(repoContext);
			}
		}
	}, 1000);

	const commands = [
		{ 
		  name: 'openai-chat.clearChat', callback: () => chatViewProvider.clearChat()
		},
		{ 
		  name: 'openai-chat-agent.createGithubContext', 
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
		  name: 'openai-chat-agent.getGithubContext', 
		  callback: async () => {
			const githubContext = await getGithubContext(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath, context);
			if (githubContext) {
			  vscode.window.showInformationMessage(`Owner get: ${githubContext.owner}, Repo get qui: ${githubContext.repo}`);
			} else {
			  vscode.window.showErrorMessage('Nessun profilo della repository trovato.');
			}
		  }
		},
		{ 
		  name: 'openai-chat-agent.clearGithubContext', 
		  callback: async () => {
			if (await clearGithubContext(context)){
				vscode.window.showInformationMessage('Profilo della repository eliminato.');
			} else {
				vscode.window.showErrorMessage('Errore durante l\'eliminazione del profilo della repository.');
			}
		  } 
		},
		{ 
			name: 'openai-chat-agent.refreshExtension', 
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
			name: 'openai-chat-agent.startToMProfileQuiz',
			callback: () => {
			  StartTomQuiz(context);
			}
		},
		{
			name: 'openai-chat-agent.getToMProfile',
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
			name: 'openai-chat-agent.clearToMProfile',
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

