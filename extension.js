// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { createChatPanel } from './src/commands/chatPanel.js';
import { ChatViewProvider } from './src/chatViewProvider.js';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
export function activate(context) {
	//Vecchio
	const disposable = vscode.commands.registerCommand('openai-chat-agent.startChat', () => {
		createChatPanel(context);
		vscode.window.showInformationMessage('Hello World from openai-chat-agent!');
	});
	context.subscriptions.push(disposable);


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

	// Registra il comando per pulire la chat
	context.subscriptions.push(
		vscode.commands.registerCommand('openai-chat.clearChat', () => {
		  chatViewProvider.clearChat();
		  vscode.window.showInformationMessage('Chat pulita con successo!');
		})
	  );
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

