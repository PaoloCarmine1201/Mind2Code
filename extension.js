// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { createChatPanel } from './src/commands/chatPanel.js';
import { ChatViewProvider } from './src/chatViewProvider.js';
import { createGithubContext, getGithubContext, clearGithubContext } from './src/commands/githubContext.js';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
export function activate(context) {
	const chatViewProvider = new ChatViewProvider(context.extensionUri);
	// Registra il provider
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('openaiChatView', chatViewProvider)
	);

	  // Pulisci la chat all'avvio dell'estensione
	// Utilizziamo setTimeout per assicurarci che la webview sia completamente caricata
	setTimeout(() => {
		chatViewProvider.clearChat();
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
			await createGithubContext(workspaceFolder, context);
			vscode.window.showInformationMessage('Profilo della repository salvato con successo.');
		  } 
		},
		{
		  name: 'openai-chat-agent.getGithubContext', 
		  callback: async () => {
			const githubContext = await getGithubContext(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath, context);
			if (githubContext) {
			  vscode.window.showInformationMessage(`Owner get: ${githubContext.owner}, Repo get: ${githubContext.repo}`);
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
		}
	  ];

	  commands.forEach(({ name, callback }) => {
		const disposable = vscode.commands.registerCommand(name, callback);
		context.subscriptions.push(disposable);
	  });
	/*

	vscode.window.registerWebviewViewProvider(...):

	Registra il tuo provider con l’ID "openaiChatView".
	Questo ID deve essere identico a quello che hai messo in package.json nella sezione "views".
	Significa: “quando VS Code deve disegnare la vista chiamata openaiChatView, usa questo provider per farlo.”

	Immagina che:
		"openaiChatView" è il nome del contenitore nel tuo package.json
		ChatViewProvider è il costruttore che sa come riempire quel contenitore

		Il tuo codice sta dicendo a VS Code:
		"Guarda, se devi riempire il contenitore openaiChatView, chiedi a questo signore qui (provider) di farlo."
	*/

}

// This method is called when your extension is deactivated
export function deactivate() {}

