// @ts-nocheck
import * as vscode from 'vscode';
import { promises as fs } from 'fs';
import { getGithubToken } from './configureMind2CodeCommand.js';
import path from 'path';
import dotenv from 'dotenv';

/**
 * Estrae owner e repo GitHub dal file .git/config del workspace
 * @param {string} workspaceFolder
 * @param {vscode.ExtensionContext} context
 */
async function extractRepoInfo(workspaceFolder , context){
    try {
        const configPath = path.join(workspaceFolder, '.git', 'config');

        const configContent = await fs.readFile(configPath, 'utf8');
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

/**
 * Analizza il contenuto di un file di configurazione per determinare il framework
 * @param {string} content - Contenuto del file da analizzare
 * @param {string} fileName - Nome del file
 * @returns {Promise<string>} - Framework rilevato
 */
async function analyzeConfigFile(content, fileName) {
  try {
    
    if (fileName === 'requirements.txt') {
      if (content.includes('flask')) {
        return 'Flask';
      } else if (content.includes('django')) {
        return 'Django';
      } else if (content.includes('fastapi')) { // Aggiunto: Rilevamento FastAPI
        return 'FastAPI';
      } else {
        return 'Python';
      }
    } else if (fileName === 'package.json') {
      const packageJson = JSON.parse(content);
      const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
      
      if (dependencies.react) {
        return 'React';
      } else if (dependencies.express) {
        return 'Express';
      } else if (dependencies.vue) {
        return 'Vue.js';
      } else if (dependencies.angular) {
        return 'Angular';
      } else {
        return 'Node.js';
      }
    } else if (fileName === 'pom.xml') {
      // Migliorato il rilevamento di Spring Boot
      if (content.includes('spring-boot') || 
          content.includes('org.springframework.boot') ||
          content.includes('spring-boot-maven-plugin') || // Aggiunto: Plugin Maven
          content.includes('org.springframework.boot:spring-boot-gradle-plugin')) { // Aggiunto: Plugin Gradle
        return 'Spring Boot';
      } else {
        return 'Java';
      }
    } else if (fileName === 'go.mod') {
      if (content.includes('github.com/gin-gonic/gin')) {
        return 'Gin';
      } else if (content.includes('github.com/gorilla/mux')) {
        return 'Gorilla';
      } else {
        return 'Go';
      }
    } else if (fileName === 'pubspec.yaml') { // Aggiunto: Rilevamento Dart/Flutter
      if (content.includes('flutter:')) {
        return 'Flutter';
      } else if (content.includes('sdk: flutter')) {
        return 'Flutter';
      } else if (content.includes('sdk: dart')) {
        return 'Dart';
      } else {
        return 'Dart'; // Default a Dart se non è specificamente Flutter
      }
    }
    
    return frameworkHints[fileName] || 'Unknown';
  } catch (error) {
    console.error(`Errore durante l'analisi del file ${fileName}:`, error);
    return 'Unknown';
  }
}

// Nuova funzione helper per recuperare ricorsivamente tutti i contenuti del repository
async function fetchRepoContentsRecursively(owner, repo, headers, pathPrefix = '', allContents = []) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${pathPrefix}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    console.error(`Failed to fetch contents for path: ${pathPrefix}, status: ${res.status}`);
    return allContents;
  }
  const data = await res.json();

  for (const item of data) {
    if (item.type === 'dir') {
      if (!IGNORED_DIRS.includes(item.name.toLowerCase())) {
        const subPath = pathPrefix ? `${pathPrefix}/${item.name}` : item.name;
        await fetchRepoContentsRecursively(owner, repo, headers, subPath, allContents);
      }
    } else if (item.type === 'file') {
      allContents.push(item);
    }
  }
  return allContents;
}

async function determineFramework(workspaceFolder, allRepoContents, headers) {
    const configFilesFound = CONFIG_FILES.filter(name => 
      allRepoContents.some(file => file.name.toLowerCase() === name.toLowerCase())
    );
    
    if (configFilesFound.length === 0) return [];
    
    
    const frameworks = [];
    
    for (const fileName of configFilesFound) {
      const fileObj = allRepoContents.find(file => file.name.toLowerCase() === fileName.toLowerCase());
      if (fileObj) {
        let fileContent;
        
        if (fileObj.download_url) {
          const response = await fetch(fileObj.download_url, { headers });
          fileContent = await response.text();
        } else {
          try {
            fileContent = await fs.readFile(path.join(workspaceFolder, fileName), 'utf8');
          } catch (readError) {
            console.error(`Errore durante la lettura del file locale ${fileName}:`, readError);
            continue;
          }
        }
        
        const framework = await analyzeConfigFile(fileContent, fileName);
        if (framework && framework !== 'Unknown') {
          frameworks.push(framework);
        }
      }
    }
    
    return frameworks;
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
  '.py': 'python',
  '.dart': 'dart'
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
  'settings.json',
  'pubspec.yaml'
];

const frameworkHints = {};

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
async function extractNamingExamples(owner, repo, headers, allRepoContents, pathPrefix = '', accumulator = {}, maxExamples = 50, currentCount = 0) {
  if (currentCount >= maxExamples) return accumulator;
  
  let data;
  if (pathPrefix === '') { // Se pathPrefix è vuoto, usiamo allRepoContents
    data = allRepoContents;
  } else {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${pathPrefix}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.error(`Failed to fetch contents for path: ${pathPrefix}, status: ${res.status}`);
      return accumulator;
    }
    data = await res.json();
  }

  for (const item of data) {
    if (currentCount >= maxExamples) break;
    
    const name = item.name;
    const lower = name.toLowerCase();
    const ext = path.extname(name);
    const filenameWithoutExt = name.replace(ext, '');

    if (item.type === 'dir') {
      if (!IGNORED_DIRS.includes(lower)) {
        const subPath = pathPrefix ? `${pathPrefix}/${name}` : name;
        const updatedAccumulator = await extractNamingExamples(owner, repo, headers, allRepoContents, subPath, accumulator, maxExamples, currentCount);
        Object.assign(accumulator, updatedAccumulator);
        currentCount = Object.values(accumulator).flat().length;
      }
    } else if (item.type === 'file') {
      const lang = EXT_LANG_MAP[ext];
      if (!lang) continue;

      for (const [key, regex] of Object.entries(NAMING_PATTERNS)) {
        if (regex.test(name)) {
          const style = detectNamingStyle(filenameWithoutExt);
          if (!accumulator[key]) {
            accumulator[key] = [];
          }
          accumulator[key].push({
            filename: name,
            namingStyle: style
          });
          currentCount++;
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
      
      const githubToken = await getGithubToken(context);

      if (!githubToken) {
          vscode.window.showErrorMessage('GitHub Token non configurato. Si prega di configurare Mind2Code.');
          return null;
      }

      const headers = {
          'Authorization': `Bearer ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json'
      };

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
      
      progress.report({ increment: 20, message: "Recupero tutti i contenuti del repository..." });
      // Definizione di allRepoContents qui
      const allRepoContents = await fetchRepoContentsRecursively(owner, repo, headers);
      
      progress.report({ increment: 20, message: "Identificazione framework..." });
      // Passa allRepoContents a determineFramework
      const framework = await determineFramework(workspaceFolder, allRepoContents, headers);
      
      progress.report({ increment: 15, message: "Analisi convenzioni di naming..." });
      // Passa allRepoContents a extractNamingExamples
      const namingExample = await extractNamingExamples(owner, repo, headers, allRepoContents, '', {}, 30);
      progress.report({ increment: 15, message: "Finalizzazione..." });
      
      const repoProfile = {
          owner: owner,
          repo: repo,
          languages: Object.entries(langData).sort((a, b) => b[1] - a[1])[0][0].toLowerCase(),
          framework: framework,
          namingExamples: namingExample,
          configFiles: CONFIG_FILES.filter(name => allRepoContents.map(f => f.name.toLowerCase()).includes(name))
      };

      context.globalState.update('repoContext', repoProfile);
      return repoProfile;
  });
}

export async function getGithubContext(workspaceFolder, context){
    const owner = context.globalState.get('githubOwner');
    const repo = context.globalState.get('githubRepo');
    
    if (owner && repo) {
        const repoContext = context.globalState.get('repoContext');
        if (repoContext) {
            return repoContext;
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