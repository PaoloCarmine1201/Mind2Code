// @ts-nocheck
import * as vscode from 'vscode';
import { promises as fs } from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

if(!GITHUB_TOKEN){
    vscode.window.showErrorMessage('GITHUB_TOKEN non è definito. Assicurati di averlo impostato nel file .env.');
}

const headers = {
    'Authorization': `Bearer ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github.v3+json'
}

/**
 * Estrae owner e repo GitHub dal file .git/config del workspace
 * @param {string} workspaceFolder
 * @param {vscode.ExtensionContext} context
 */
async function extractRepoInfo(workspaceFolder , context){
    try {
        const configPath = path.join(workspaceFolder, '.git', 'config');

        // Leggi il contenuto del file
        const configContent = await fs.readFile(configPath, 'utf8');
        // Cerca l'URL del repository remoto
        const urlMatch = configContent.match(/\[remote "origin"\][\s\S]*?url = .*?github\.com[:\/]([^/]+)\/([^.\s]+)(\.git)?/i);
        
        if (urlMatch && urlMatch.length >= 3) {
            const owner = urlMatch[1];
            const repo = urlMatch[2];
            
            // Salva le informazioni nel context
            context.globalState.update('githubOwner', owner);
            context.globalState.update('githubRepo', repo);
            
            return { owner, repo };
        } else {
            console.log('Non è stato possibile trovare le informazioni del repository GitHub');
            return null;
        }
    } catch (error) {
        console.error('Errore durante l\'estrazione delle informazioni del repository:', error);
        return null;
    }
}

const IGNORED_DIRS = ['node_modules', 'build', 'dist', '.git', '.vscode', 'docs', 'test', 'tests'];
const NAMING_PATTERNS = {
  controllers: /controller/i,
  services: /service/i,
  handlers: /handler/i,
  repositories: /repository/i
};
const EXT_LANG_MAP = {
  '.js': 'javascript',
  '.ts': 'typescript',
  '.go': 'go',
  '.java': 'java',
  '.py': 'python'
};

const CONFIG_FILES = [
  '.env',
  'application.properties',
  'application.yml',
  'pom.xml',
  'build.gradle',
  'package.json',
  'requirements.txt',
  'go.mod',
  'config.json',
  'config.js',
  'config.ts',
  'config.go',
  'settings.py',
  'settings.json'
];


/**
 * Deduci tipo di naming (CamelCase, snake_case, kebab-case)
 */
function detectNamingStyle(filenameWithoutExt) {
  if (/-/.test(filenameWithoutExt)) return 'kebab-case';
  if (/_/.test(filenameWithoutExt)) return 'snake_case';
  if (/^[A-Z][a-z]+(?:[A-Z][a-z]*)+$/.test(filenameWithoutExt)) return 'CamelCase';
  return 'unknown';
}

/**
 * Estrae esempi significativi e analizza stile + linguaggio
 */
async function extractNamingExamples(owner, repo, preloadedData = null, pathPrefix = '', accumulator = {}, maxFiles = 50, currentCount = 0) {
  if (currentCount >= maxFiles) return accumulator;
  
  let data;
  if (preloadedData && pathPrefix === '') {
    data = preloadedData;
  } else {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${pathPrefix}`;
    const res = await fetch(url, { headers });
    if (!res.ok) return accumulator;
    data = await res.json();
  }

  for (const item of data) {
    if (currentCount >= maxFiles) break;
    
    const name = item.name;
    const lower = name.toLowerCase();
    const ext = path.extname(name);
    const filenameWithoutExt = name.replace(ext, '');

    if (item.type === 'dir') {
      if (!IGNORED_DIRS.includes(lower)) {
        const subPath = pathPrefix ? `${pathPrefix}/${name}` : name;
        await extractNamingExamples(owner, repo, null, subPath, accumulator, maxFiles, currentCount);
        currentCount = Object.values(accumulator).flat().length;
      }
    } else if (item.type === 'file') {
      const lang = EXT_LANG_MAP[ext];
      if (!lang) continue;

      for (const [key, regex] of Object.entries(NAMING_PATTERNS)) {
        if (regex.test(name) && !(accumulator[key]?.length)) {
          const style = detectNamingStyle(filenameWithoutExt);
          accumulator[key] = [
            {
              filename: name,
              namingStyle: style
            }
          ];
          currentCount++;
          break; // Passa al file successivo dopo aver trovato un match
        }
      }
    }
  }

  return accumulator;
}

export async function createGithubContext(workspaceFolder, context) {
  return await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: "Analisi repository GitHub",
      cancellable: false
  }, async (progress) => {
      progress.report({ increment: 0, message: "Inizio analisi repository..." });
      
      const result = await extractRepoInfo(workspaceFolder, context);
      progress.report({ increment: 20, message: "Informazioni repository estratte" });
      
      let owner = null;
      let repo = null;
      if(result) {
          owner = result.owner;
          repo = result.repo;
      }

      progress.report({ increment: 10, message: "Recupero linguaggi utilizzati..." });
      const langRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/languages`, { headers });
      const langData = await langRes.json();
      
      progress.report({ increment: 20, message: "Analisi file principali..." });
      const contentsRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents`, { headers });
      const contents = await contentsRes.json();
      
      progress.report({ increment: 20, message: "Identificazione framework..." });
      const fileNames = contents.map(f => f.name.toLowerCase());
      const frameworkHints = {
        'pom.xml': 'spring boot',
        'build.gradle': 'spring boot',
        'package.json': 'node.js / react / express',
        'requirements.txt': 'flask / django',
        'go.mod': 'go modules'
      };
      const framework = Object.keys(frameworkHints)
            .filter(name => fileNames.includes(name))
            .map(name => frameworkHints[name]);

      
      progress.report({ increment: 15, message: "Analisi convenzioni di naming..." });
      const namingExample = await extractNamingExamples(owner, repo, contents, '', {}, 30); // Limita a 30 file      
      progress.report({ increment: 15, message: "Finalizzazione..." });
      
      const repoProfile = {
          owner: owner,
          repo: repo,
          languages: Object.entries(langData).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([lang]) => lang.toLowerCase()),
          framework: framework,
          namingExamples: namingExample,
          configFiles: CONFIG_FILES.filter(name => fileNames.includes(name))
      };

      context.globalState.update('repoContext', repoProfile);
      console.log("Profilo della repository creato:", JSON.stringify(repoProfile, null, 2));
      return repoProfile;
  });
}

export async function getGithubContext(workspaceFolder, context){
    console.log("Recupero del profilo della repository in corso...");
    const owner = context.globalState.get('githubOwner');
    const repo = context.globalState.get('githubRepo');
    
    if (owner && repo) {
        console.log(`Owner get: ${owner}, Repo get: ${repo}`);
        const repoContext = context.globalState.get('repoContext');
        if (repoContext) {
            //console.log("Context repository:", JSON.stringify(repoContext, null, 2));
            console.log("TUTTO OK")
            return repoContext;
        } else {
            console.log("Nessun profilo della repository trovato nel context.");
        }
        return repoContext;
    } else {
        return null;
    }
}

export async function clearGithubContext(context){
    context.globalState.update('githubOwner', null);
    context.globalState.update('githubRepo', null);
    context.globalState.update('repoContext', null);
    console.log("Profilo della repository eliminato dal context.");
    return true;
}