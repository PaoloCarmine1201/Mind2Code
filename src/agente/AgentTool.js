// @ts-nocheck
import { tool } from '@langchain/core/tools';
import { date, z } from 'zod';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { llm } from './AgentModel.js';
import { promises as fs } from 'fs';
import path from 'path';
import * as vscode from 'vscode';

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

        **IMPORTANT — PERSONALIZATION**
        Use the GitHub repository context to infer technical aspects such as the **MOST USED PROGRAMMING LANGUAGES**, **framework structure**, **architectural patterns**, and **naming conventions**. Integrate this information with the user's cognitive profile to adapt the output's style, experience level, and learning preferences:
        - From the user's cognitive profile, adapt the **experience level** and **preferred learning style** (e.g., step-by-step with comments for beginners; concise, idiomatic code for experts).
        - From the user's cognitive profile, align the **tone**, **terminology depth**, and **code complexity** to their profile.
        - From the GitHub repository context, follow the repository's ** first most used programming languages**, **frameworks**, **architectural patterns**, and **naming conventions**.
        If any assumption is needed, **state it in one brief sentence tailored to the user**, then proceed.

        Only return a JSON object — no extra explanation or comments.

        OBBLIGATORIO
        La risposta deve essere **SEMPRE** in italiano

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

          FOLLOW THIS PRIORITY ORDER (strict):
          1) Check the input requirement for any **explicit language mention** and use it if present.
          2) Otherwise, **infer the language from the GitHub repository context** by looking at the **frameworks** in use: "${input.github_context}".
            - The framework DICTATES the language. Examples (not exhaustive):
              - Spring / Spring Boot → java
              - Flutter → dart
            - If multiple frameworks are present, pick the **dominant** one (by prevalence in the context); when in doubt, choose the one **most central** to the requirement.
            - The **framework-derived language takes precedence** over user preferences.".
        Respond ONLY with a JSON object like: { "language": "..." }

		Requirement to analyze: "${input.requirement}"
		GitHub repository context: "${input.github_context}"`
    }
  ]);

  // Estrai e pulisci la risposta
  const language = response.language.trim().toLowerCase();
  console.log("Detected language:", language);
  
  // Verifica che sia un linguaggio valido
  const validLanguages = [
    "python", "javascript", "java", "cpp", "go",
    "typescript", "ruby", "php", "csharp", "c", "dart"
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
  } else if (input.language === "go" && !filename.endsWith(".go")) {
      filename = filename.replace(/\.\w+$/, "") + ".go";
  } else if (input.language === "typescript" && !filename.endsWith(".ts")) {
      filename = filename.replace(/\.\w+$/, "") + ".ts";
  } else if (input.language === "c" && !filename.endsWith(".c")) {
      filename = filename.replace(/\.\w+$/, "") + ".c";
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

    let refineReq;
      try {
        refineReq = JSON.parse(input.requirement);
      } catch (e) {
        // Se non è un JSON valido, includi comunque il testo originale
        refineReq = { acceptance_criteria: [], original_requirement: input.requirement };
      }

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

                **IMPORTANT**: Carefully consider all the acceptance criteria.
                ${Array.isArray(refineReq.acceptance_criteria) && refineReq.acceptance_criteria.length > 0
                  ? refineReq.acceptance_criteria.map(ac => `- ${ac}`).join("\n")
                  : (refineReq.original_requirement ? `- ${refineReq.original_requirement}` : "")}

                GENERATE THE CODE THAT SATISFIES ALL THE **ACCEPTANCE CRITERIA**.

                **IMPORTANT — PERSONALIZATION**
                When generating code, use the user's cognitive profile/mental state to adapt every aspect of the output to the user's mental model:
                - Match the user's experience level and preferred learning style (e.g., step-by-step with comments for beginners; concise, idiomatic code for experts).
                - Tune code complexity, abstraction, naming, and comment density accordingly. Directly apply the mental profile's preferences for code complexity, abstraction level, and comment density (e.g., if the profile indicates "heavily commented," include many comments).
                - Align the tone and terminology depth exactly as specified in the profile.
                - On trade-offs, the user’s preferences and mental model override generic best practices.
                If any assumption is needed, state it in one brief, user-tailored sentence, then proceed.

                **IMPORTANT — COMMENTING & DOCS POLICY**
                Apply comments/docs strictly from the user profile:
                - Experience: beginner → step-by-step inline comments for each non-trivial line; intermediate → block-level comments + brief function headers; advanced → sparse intent comments only; expert → comments only where non-obvious.
                - Code style: commented → many inline comments per block; clean → light comments, prefer descriptive names; concise → avoid comments unless clarifying intent; documented → full API docs for every public class/function (params/returns), minimal inline.
                - Learning preference: examples → include a tiny usage example with brief guiding comments; documentation → richer API docs (params/returns/examples) over inline; tutorials → prefix main blocks with "Step 1/2/..." comments; exploration → minimal comments plus TODO/NOTE hints for experiments.
                - Language-specific docs: JS/TS → JSDoc \`/** ... */\`; Python → docstrings """ ... """; Java → Javadoc \`/** ... */\`; others → idiomatic header/function comments.

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

const propose_followup = tool(async (input) => {
  console.log("PROPOSE FOLLOW-UP TOOL");
  
  // Utilizziamo il modello LLM per generare un follow-up basato sul requisito e sul codice generato
  const response = await llm.withStructuredOutput(
    z.object({
      followup: z.string().describe("The proposed follow-up question or action.")
    }),
    { strict: true }
  ).invoke([
    {
      role: "system",
      content: `You are an assistant that proposes a follow-up improvement to the generated code. 
                The follow-up must always be a yes/no question, phrased so that the user can simply answer "yes" to implement it or "no" to skip it. 
                Do NOT propose open-ended or vague questions (e.g., "What additional measures..."). 
                The follow-up should suggest a concrete, implementable improvement to the code, directly related to the requirement. 

        Refined requirement: "${input.refined_requirement}"
        Generated Code: "${input.generated_code}"

        Return ONLY a JSON object like: { "followup": "..." }
        No comments, no explanations.
        
        OBBLIGATORIO
        La risposta deve essere sempre in italiano`
    }
  ]);

  return {
    followup: response.followup
  };
},{
  name: 'propose_followup',
  description: 'Call to propose a follow-up question or action based on the generated code and requirement.',
  schema: z.object({
    refined_requirement: z.string().describe("The refined requirement text."),
    generated_code: z.string().describe("The code that was generated based on the requirement."),
    confidence: z.number().optional().describe("Confidence level for the follow-up proposal, between 0 and 1."),
  })
})

// Tool per implementare i miglioramenti proposti dal follow-up
const implement_improvement = tool(async (input) => {
  console.log("IMPLEMENT IMPROVEMENT TOOL");
  
  // Utilizziamo il modello LLM per implementare il miglioramento proposto
  const response = await llm.withStructuredOutput(
    z.object({
      improved_code: z.string().describe("The improved code with the suggested changes implemented.")
    }),
    { strict: true }
  ).invoke([
    {
      role: "system",
      content: `You are an assistant that implements code improvements based on a follow-up suggestion.

        Original Code: "${input.generated_code}"
        Follow-up Suggestion: "${input.followup}"
        Programming Language: ${input.language}
        
        Your task is to implement the improvements suggested in the follow-up.

        Maintain the original code's style exactly—formatting/indentation, naming conventions, comment/doc style (JSDoc/docstrings/Javadoc), and architectural patterns.
        When adding or modifying code, keep all existing comments and structure intact, and write new code with the same style and equivalent comments/docs; do not reformat or introduce a different style anywhere.
        
        Return ONLY a JSON object like: { "improved_code": "..." }
        The improved_code should be the complete code with the improvements implemented, not just the changes.
        No comments, no explanations outside the code.`
    }
  ]);

  const formattedCode = `\`\`\`\n${response.improved_code}\n\`\`\``;

  return formattedCode;
}, {
  name: 'implement_improvement',
  description: 'Call to implement improvements suggested in the follow-up.',
  schema: z.object({
    generated_code: z.string().describe("The original generated code."),
    followup: z.string().describe("The follow-up suggestion for improvement."),
    language: z.string().describe("The programming language of the code.")
  })
});

//create a tool that save the code into a file
export const save_code = tool(async (input) => {
  console.log("SAVE CODE TOOL");
  let code = input.generated_code;
  let filename = input.filename;

  // Rimuovi i backticks se presenti
  const backtickPattern = /^```(?:\w+)?\n?([\s\S]*?)```$/;
  const match = code.match(backtickPattern);
  
  if (match) {
    // Estrai solo il contenuto tra i backticks
    code = match[1];
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
      confidence: z.number().optional().describe("Confidence level for the save operation, between 0 and 1."),
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

export const tools = [is_requirement, refine_requirement, classify_language, generate_code, propose_followup, extract_filename, implement_improvement, save_code];
export const toolNode = new ToolNode(tools);