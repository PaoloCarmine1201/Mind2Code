import * as vscode from 'vscode';

export async function configureMind2Code(context) {
    return new Promise((resolve) => {
        const panel = vscode.window.createWebviewPanel(
            'Mind2CodeConfiguration',
            'Configura Mind2Code',
            vscode.ViewColumn.Two,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        panel.webview.html = getConfigurationHtml(panel.webview, context);

        panel.webview.onDidReceiveMessage(
            async (message) => {
                if (message.command === 'saveConfiguration') {
                    const { apiKey, model, githubToken } = message.value;

                    const answers = {
                        apiKey: apiKey || '',
                        model: model || '',
                        githubToken: githubToken || ''
                    };

                    await context.globalState.update('Mind2CodeConfiguration', answers);

                    vscode.window.showInformationMessage('Configurazione salvata con successo!');
                    panel.dispose();
                    resolve(true);
                }
            },
            undefined,
            context.subscriptions
        );

        panel.onDidDispose(() => {
            resolve(false);
        }, null, context.subscriptions);
    });
}

function getConfigurationHtml(webview, context) {
    const currentConfig = context.globalState.get('Mind2CodeConfiguration') || {};

    const currentApiKey = currentConfig.apiKey || '';
    const currentModel = currentConfig.model || '';
    const currentGithubToken = currentConfig.githubToken || '';

    return `
        <!DOCTYPE html>
        <html lang="it">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Configura Mind2Code</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 20px; }
                h1 { color: var(--vscode-foreground); }
                label { display: block; margin-top: 15px; margin-bottom: 5px; color: var(--vscode-foreground); }
                input[type="text"] {
                    width: 100%;
                    padding: 8px;
                    margin-bottom: 10px;
                    border: 1px solid var(--vscode-input-border);
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border-radius: 3px;
                }
                button {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    padding: 10px 20px;
                    border: none;
                    border-radius: 3px;
                    cursor: pointer;
                    margin-top: 20px;
                }
                button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
            </style>
        </head>
        <body>
            <h1>⚙️ Configura Mind2Code</h1>
            <p>Inserisci la tua API Key e il modello che desideri utilizzare per l'agente.</p>

            <label for="apiKey">API Key:</label>
            <input type="text" id="apiKey" value="${currentApiKey}" placeholder="La tua API Key (es. sk-xxxxxxxxxxxxxxxxxxxx)">

            <label for="model">Modello:</label>
            <input type="text" id="model" value="${currentModel}" placeholder="Nome del modello (es. gpt-4o)">

            <label for="githubToken">GitHub Token:</label>
            <input type="text" id="githubToken" value="${currentGithubToken}" placeholder="Il tuo token personale di GitHub (es. ghp_xxxxxxxxxxxxxxxxxxxx)">

            <button id="saveButton">Salva Configurazione</button>

            <script>
                const vscode = acquireVsCodeApi();
                document.getElementById('saveButton').addEventListener('click', () => {
                    const apiKey = document.getElementById('apiKey').value;
                    const model = document.getElementById('model').value;
                    const githubToken = document.getElementById('githubToken').value; // Ottieni il token GitHub
                    vscode.postMessage({
                        command: 'saveConfiguration',
                        value: { apiKey, model, githubToken } // Invia il token GitHub
                    });
                });
            </script>
        </body>
        </html>
    `;
}

/**
 * Recupera la chiave API dal contesto dell'estensione.
 */
export async function getApiKey(context) {
    const config = await context.globalState.get('Mind2CodeConfiguration');
    return config ? config.apiKey : undefined;
}

/**
 * Recupera il modello dal contesto dell'estensione.
 */
export async function getModel(context) {
    const config = await context.globalState.get('Mind2CodeConfiguration');
    return config ? config.model : undefined;
}

/**
 * 
 * recupera il token di github dal contesto dell'estensione 
 */
export async function getGithubToken(context) {
    const config = await context.globalState.get('Mind2CodeConfiguration');
    return config ? config.githubToken : undefined;
}

export function flushConfiguration(context) {
    context.globalState.update("Mind2CodeConfiguration", null)
}

/**
 * Funzione che mi stampa lo stato della configurazione
 */
export function printConfigurationStatus(context) {
    const config = context.globalState.get('Mind2CodeConfiguration');
    if (config) {
        const apiKeyStatus = config.apiKey ? `Configurata (***${config.apiKey.slice(-4)})` : 'Non configurata';
        const modelStatus = config.model ? `Configurato (${config.model})` : 'Non configurato';
        const githubTokenStatus = config.githubToken ? `Configurato (***${config.githubToken.slice(-4)})` : 'Non configurato';

        const message = `Stato configurazione Mind2Code:\n` +
                        `  API Key: ${apiKeyStatus}\n` +
                        `  Modello: ${modelStatus}\n` +
                        `  GitHub Token: ${githubTokenStatus}`;
                        
        vscode.window.showInformationMessage(message);
    } else {
        vscode.window.showInformationMessage('Nessuna configurazione Mind2Code trovata.');
    }
}