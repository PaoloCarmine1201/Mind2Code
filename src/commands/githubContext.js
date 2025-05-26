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
async function extractNamingExamples(owner, repo, preloadedData = null ,pathPrefix = '', accumulator = {}) {
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
    const name = item.name;
    const lower = name.toLowerCase();
    const ext = path.extname(name);
    const filenameWithoutExt = name.replace(ext, '');

    if (item.type === 'dir') {
      if (!IGNORED_DIRS.includes(lower)) {
        await extractNamingExamples(owner, repo, null, pathPrefix ? `${pathPrefix}/${name}` : name, accumulator);
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
        }
      }
    }
  }

  return accumulator;
}

export async function createGithubContext(workspaceFolder, context){
    const result = await extractRepoInfo(workspaceFolder, context);
    let owner = null;
    let repo = null;
    if(result){
        owner = result.owner;
        repo = result.repo;
    }

    // 1. Linguaggi
    const langRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/languages`, { headers });
    const langData = await langRes.json();
    const topLanguages = Object.entries(langData)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([lang]) => lang.toLowerCase());

    // 2. File principali nella root (per dedurre framework)
    const contentsRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents`, { headers });
    const contents = await contentsRes.json();
    const fileNames = contents.map(f => f.name.toLowerCase());
    
    // 3. Framework hint
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
    
    // 4. Convenzioni nei nomi file
    const namingExample = await extractNamingExamples(owner, repo, contents);
    
    // 5. File di configurazione
    const configFiles = CONFIG_FILES.filter(name => fileNames.includes(name));

    const repoProfile = {
        owner: owner,
        nameRepo: repo,
        languages: topLanguages,
        framework: framework,
        namingExamples: namingExample,
        configFiles: configFiles
    };

    // Salva il profilo della repository nel context

    console.log("✅ Profilo repository costruito:", JSON.stringify(repoProfile, null, 2));
    context.globalState.update('repoContext', repoProfile);
    /*
    console.log(`Framework hints: ${framework}`);
    console.log("Esempi di naming rilevati:", JSON.stringify(namingExample, null, 2));
    console.log("File di configurazione", configFiles)*/
}

export async function getGithubContext(workspaceFolder, context){
    const owner = context.globalState.get('githubOwner');
    const repo = context.globalState.get('githubRepo');
    
    if (owner && repo) {
        console.log(`Owner get: ${owner}, Repo get: ${repo}`);
        const repoContext = context.globalState.get('repoContext');
        if (repoContext) {
            console.log("Context repository:", JSON.stringify(repoContext, null, 2));
        } else {
            console.log("Nessun profilo della repository trovato nel context.");
        }
        return { owner, repo };
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