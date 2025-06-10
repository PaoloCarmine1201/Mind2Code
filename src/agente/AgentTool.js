// @ts-nocheck
import { tool } from '@langchain/core/tools';
import { date, z } from 'zod';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { llm } from './agentModel.js';
import { promises as fs } from 'fs';
import path from 'path';
import * as vscode from 'vscode';

//tool with confidence level of LLM
const is_requirement = tool(async (input) => {
    console.log("IS REQUIREMENT TOOL");

    const response = await llm
    .withStructuredOutput(
      z.object({
        requirement: z.boolean().describe("True if the input is a requirement, false otherwise")
      }),
      { strict: true }
    )
    .invoke([
      {
        role: "system",
        content: `
          You are a classifier that determines whether a given input is a software requirement.

          Return a JSON object in the format:
          { "requirement": true } if the input describes a software feature or behavior,
          { "requirement": false } otherwise.

          Software requirements typically:
          - Describe what a system should do
          - Specify features or behaviors
          - May be formal or informal

          Input to analyze: "${input.requirement}"
          `
      }
    ]);

    return { 
      requirement: response.requirement, 
      confidence: input.confidence // restituisce anche la confidence passata in input
    };
}, {
    name: 'is_requirement',
    description: 'Call to check if the input is a requirement or a feature.',
    schema: z.object({
      requirement: z.string().describe("Input to analyze as a potential software requirement."),
      confidence: z.number().optional().describe("Confidence level for the requirement classification, between 0 and 1.")
    })
}
)

const refine_requirement = tool(async (input) => {
  console.log("REFINE REQUIREMENT TOOL");
  const response = await llm
    .withStructuredOutput(
      z.object({
            user_story: z.string().describe("User story in the format 'As a ..., I want to ..., so that ...'"),
            acceptance_criteria: z.array(z.string()).describe("Testable acceptance criteria")      }),
      { strict: true }
    )
    .invoke([
      {
        role: "system",
        content: `You are an assistant specialized in agile software design.

        Your task is to take a vague or unstructured user request and turn it into a structured **User Story** followed by precise and testable **Acceptance Criteria**.

        Return only a JSON object with:
        {
          "user_story": "...",
          "acceptance_criteria": ["...", "..."]
        }

        Follow this format inside the user_story field:

        **User Story:**
        - As a [role], I want to [goal], so that [benefit].

        Follow this format inside the acceptance_criteria field:

        **Acceptance Criteria:**
        - AC #1: ...
        - AC #2: ...
        - AC #n: ...
        
        **IMPORTANT**
        Adapt the tone and structure using the GitHub repository context and user profile.

        Only return a JSON object — no extra explanation or comments.

        ---

        **User Request:**
        ${input.requirement}

        **GitHub Context:**
        ${input.github_context}

        **User Profile:**
        ${input.user_profile}
        `
      }
    ]);    
    // Trasforma l'output strutturato in una stringa JSON con escaping

  return {
    requirement: JSON.stringify(response, null, 2)
  };
}, {
  name: 'refine_requirement',
  description: 'Call to refine a software requirement to make it clearer and more actionable.',
  schema: z.object({
    requirement: z.string().describe("The input requirement to refine."),
    github_context: z.string().describe("The GitHub repository context to provide context for refinement requirement."),
    user_profile: z.string().describe("The user profile to tailor the refinement."),
  })
})

//create a tool that classify language of the requirement
//tool with confidence level of LLM
const classify_language = tool(async (input) => {
  console.log("CLASSIFY LANGUAGE TOOL");

  // Utilizziamo il modello LLM per determinare il linguaggio basandosi sul requisito
  // e sul contesto GitHub che è già stato fornito nel prompt di sistema
  const response = await llm.withStructuredOutput(
    z.object({
      language: z.string().describe("The programming language identified from the requirement.")
    }),
    { strict: true }
  ).invoke([
    {
      role: "system",
      content: `You are an assistant that determines the most appropriate programming language to implement a software requirement.

        **FOLLOW THIS PRIORITY ORDER**:
        1. FIRST, analyze the input requirement for explicit language mentions
        2. SECOND, If no language is specified, check the GitHub repository context
        3. THIRD, Then check the user's profile

        Respond ONLY with a JSON object like: { "language": "..." }

		Requirement to analyze: "${input.requirement}"
		GitHub repository context: "${input.github_context}"
    User profile: "${input.user_profile}"`
    }
  ]);

  // Estrai e pulisci la risposta
  const language = response.language.trim().toLowerCase();
  
  // Verifica che sia un linguaggio valido
  const validLanguages = [
    "python", "javascript", "java", "cpp", "go",
    "typescript", "ruby", "php", "csharp", "c"
  ];

  const normalized = (() => {
    if (validLanguages.includes(language)) return language;
    if (language.includes("js")) return "javascript";
    if (language.includes("ts")) return "typescript";
    if (language.includes("c#")) return "csharp";
    if (language.includes("c++")) return "cpp";
    return "python";
  })();


  return {
    language: normalized,
    confidence: input.confidence // restituisce anche la confidence passata in input
  }
}, {
  name: 'classify_language',
  description: 'Call to classify the language of the requirement.',
  schema: z.object({
    requirement: z.string().describe("The requirement text to analyze for language information."),
    github_context: z.string().describe("The GitHub repository context to provide context for language classification."),
    confidence: z.number().optional().describe("Confidence level for the language classification, between 0 and 1."),
    user_profile: z.string().optional().describe("The user profile to tailor the language classification.")
  })
})

//create a tool that extracts a filename from the requirement
//tool with confidence level of LLM
const extract_filename = tool(async (input) => {
  console.log("EXTRACT FILENAME TOOL");
  
  const response = await llm.withStructuredOutput(
    z.object({
      filename: z.string().describe("The suggested filename with extension extracted from the requirement.")
    }),
    { strict: true }
    ).invoke([
    {
      role: "system",
      content: `You are an assistant that extracts an appropriate filename from a software requirement.
      
		Analyze the requirement and generate a filename that:
		1. Reflects the main described functionality
		2. Follows naming conventions for the ${input.language} language
		3. Includes the correct file extension for the language
    4. Respects any naming conventions or patterns found in the following GitHub repository context:
    ${input.github_context}
		
		Requirement to analyze: "${input.requirement}"
		
		Return ONLY a JSON object like: { "filename": "..." }
    No comments, no explanations.`
      }
  ]);


  // Pulisci la risposta da eventuali caratteri non desiderati
  let filename = response.filename.trim();
  
  // Assicurati che il nome del file abbia l'estensione corretta
  if (input.language === "python" && !filename.endsWith(".py")) {
      filename = filename.replace(/\.\w+$/, "") + ".py";
  } else if (input.language === "javascript" && !filename.endsWith(".js")) {
      filename = filename.replace(/\.\w+$/, "") + ".js";
  } else if (input.language === "java" && !filename.endsWith(".java")) {
      filename = filename.replace(/\.\w+$/, "") + ".java";
  } else if (input.language === "cpp" && !filename.endsWith(".cpp")) {
      filename = filename.replace(/\.\w+$/, "") + ".cpp";
  }

  return {
    filename: filename,
    confidence: input.confidence // restituisce anche la confidence passata in input
  };
}, {
  name: 'extract_filename',
  description: 'Estrae un nome di file appropriato dal requisito fornito.',
  schema: z.object({
    requirement: z.string().describe("Il requisito da cui estrarre il nome del file."),
    language: z.string().describe("Il linguaggio di programmazione per determinare l'estensione corretta."),
    confidence: z.number().optional().describe("Confidence level for the filename extraction, between 0 and 1."),
    github_context: z.string().describe("Il contesto del repository GitHub per fornire informazioni aggiuntive.")
  })
})

//create a tool that generate code from the requirement
const generate_code = tool(async (input) => {
    console.log("GENERATE CODE TOOL");
    console.log("INPUT TO GENERATE CODE: ", JSON.stringify(input, null, 2));


    const response = await llm.withStructuredOutput(
      z.object({
        code_block: z.string().describe("The generated code, without markdown or triple backticks.")
      }),
      { strict: true }
    ).invoke([
      {
        role: "system",
        content: `
                You are a code generator that generates code from a given requirement.
                The code should be written in the ${input.language} programming language.

                Input to analyze: "${input.requirement}"

                IMPORTANT: Carefully consider the following user profile when generating the code. 
                Adapt the code style, complexity, comments, and structure to match the user's preferences and experience level.

                USER PROFILE:
                ${input.user_profile}

                Return a JSON object with:
                {
                  "code_block": "The generated code ONLY, without triple backticks, without markdown, and with correct indentation"
                }

                Do NOT include:
                - Any explanation
                - Any language tags
                - Any triple backticks
                - Any comments outside the JSON
                `
      }
    ]);

    const formattedCode = `\`\`\`\n${response.code_block}\n\`\`\``;

    return formattedCode;
}, {
    name: 'generate_code',
    description: 'Call to generate code from the requirement.',
    schema: z.object({
      requirement: z.string().describe("The requirement text to generate code from."),
      language: z.string().describe("The programming language to generate code in."),
      user_profile: z.string().describe("The user profile to tailor the code generation."),
    })
}

)

//create a tool that save the code into a file
const save_code = tool(async (input) => {
  console.log("SAVE CODE TOOL");
  let code = input.generated_code;
  let filename = input.filename;

  // Rimuovi i backticks se presenti
  const backtickPattern = /^```(?:\w+)?\n?([\s\S]*?)```$/;
  const match = code.match(backtickPattern);
  
  if (match) {
    // Estrai solo il contenuto tra i backticks
    code = match[1];
    console.log("Backticks rimossi dal codice");
  }

  if (!filename.startsWith("out/")) {
    filename = `out/${filename}`;
  }

  try {
    // Utilizziamo la funzione saveCodeToFile che usa le API di VS Code
    return await saveCodeToFile(filename, code);
  } catch (error) {
    console.error(`Errore durante il salvataggio del file: ${error.message}`);
    return false;
  }
}, {
    name: 'save_code',
    description: 'Call to save the code into a file.',
    schema: z.object({
      generated_code: z.string().describe("The generated code to save."),
      filename: z.string().describe("The filename to save the code into."),
    })
})

async function saveCodeToFile(filename, code, webview = null) {
  try {
    // Ottieni la directory corrente dell'area di lavoro
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      throw new Error("Nessuna directory di lavoro aperta");
    }
    
    const currentDir = workspaceFolders[0].uri;
    
    // Crea il percorso completo del file
    const filePath = vscode.Uri.joinPath(currentDir, filename);
    
    // Crea o sovrascrive il file
    await vscode.workspace.fs.writeFile(
      filePath,
      Buffer.from(code, 'utf8')
    );
    
    // Notifica l'utente
    if (webview) {
      webview.postMessage({ 
        command: 'reply', 
        text: `✅ Codice salvato con successo nel file: ${filename}` 
      });
    }
    
    // Apri il file nell'editor
    const document = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(document);
    
    return true;
  } catch (error) {
    console.error("Errore durante il salvataggio del file:", error);
    if (webview) {
      webview.postMessage({ 
        command: 'reply', 
        text: `❌ Errore durante il salvataggio del file: ${error.message}` 
      });
    }
    return false;
  }
}

export const tools = [is_requirement, refine_requirement, classify_language, generate_code, extract_filename, save_code];
export const toolNode = new ToolNode(tools);