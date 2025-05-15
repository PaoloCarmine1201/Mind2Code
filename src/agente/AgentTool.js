// @ts-nocheck
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { llm } from './AgentModel.js';
import { promises as fs } from 'fs';
import path from 'path';

//TODO: create a tool that checks if the input is a requirement or a featur
const is_requirement = tool(async (input) => {
    console.log("IS REQUIREMENT TOOL");
    
    const response = await llm.invoke([
      {
        role: "system",
        content: `You are a classifier that determines whether a given input is a software requirement.
    
    Reply ONLY with a JSON object in the format:
    { "requirement": true } if the input describes a software feature or behavior
    { "requirement": false } otherwise
    
    Software requirements typically:
    - Describe what a system should do
    - Specify features or behaviors
    - May be formal or informal
    
    Input to analyze: "${input.requirement}"`
      }
    ]);

    //console.log("🤖 Risposta LLM:", response, "fine risposta LLM");

    try {
      const parsedResponse = JSON.parse(response.content);
      //console.log("Risposta analizzata:", parsedResponse);
      
      if (typeof parsedResponse.requirement !== 'boolean') {
          throw new Error("Formato risposta non valido: 'requirement' dovrebbe essere un booleano");
      }
      
      return parsedResponse.requirement; // Restituisce true o false
    } catch (error) {
        console.error("Errore nell'analisi della risposta:", error);
        throw new Error("Formato risposta non valido dal modello LLM");
    }
}, {
    name: 'is_requirement',
    description: 'Call to check if the input is a requirement or a feature.',
    schema: z.object({
      requirement: z.string().describe("Input to analyze as a potential software requirement."),
    })
}
)

//create a tool that classify language of the requirement
const classify_language = tool(async (input) => {
    console.log("CLASSIFY LANGUAGE TOOL");

    const text = input.requirement.toLowerCase();
    if (text.includes("python")) return "python";
    if (text.includes("java")) return "java";
    if (text.includes("javascript") || text.includes("js")) return "javascript";
    if (text.includes("c++")) return "cpp";
    // Default to Python if not specified
    return "python";
}, {
    name: 'classify_language',
    description: 'Call to classify the language of the requirement.',
    schema: z.object({
      requirement: z.string().describe("The requirement text to analyze for language information."),    })
    }
)

//create a tool that generate code from the requirement
const generate_code = tool(async (input) => {
    console.log("GENERATE CODE TOOL");
    //console.log("LINGUA: ", input.language);
    //console.log("REQUIREMENT: ", input.requirement);
    const response = await llm.invoke([
      {
        role: "system",
        content: `You are a code generator that generates code from a given requirement.
        The code should be written in the ${input.language} programming language.
        Input to analyze: "${input.requirement}".
        The final output must be a **single block of code enclose it between triple backticks**, such as:
        \`\`\`
          def hello_world():
              print("Hello, world!")
        \`\`\`

        **Important rules**:
        - Follow the requirement precisely, using your tools effectively to reach the goal.
        `
      }
    ])

    //console.log("🤖 Risposta codice generato LLM:", response, "fine risposta LLM");
    return response.content;
}, {
    name: 'generate_code',
    description: 'Call to generate code from the requirement.',
    schema: z.object({
      requirement: z.string().describe("The requirement text to generate code from."),
      language: z.string().describe("The programming language to generate code in."),
    })
}

)

//create a tool that extracts a filename from the requirement
const extract_filename = tool(async (input) => {
  console.log("EXTRACT FILENAME TOOL");
  
  const response = await llm.invoke([
    {
      role: "system",
      content: `You are an assistant that extracts an appropriate filename from a software requirement.
      
    Analyze the requirement and generate a filename that:
    1. Reflects the main described functionality
    2. Follows naming conventions for the ${input.language} language
    3. Includes the correct file extension for the language
    
    Requirement to analyze: "${input.requirement}"
    
    Reply with ONLY the suggested filename, without any comments or additional explanation.`
      }
  ]);
  
  // Pulisci la risposta da eventuali caratteri non desiderati
  let filename = response.content.trim();
  
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
  
  return filename;
}, {
  name: 'extract_filename',
  description: 'Estrae un nome di file appropriato dal requisito fornito.',
  schema: z.object({
    requirement: z.string().describe("Il requisito da cui estrarre il nome del file."),
    language: z.string().describe("Il linguaggio di programmazione per determinare l'estensione corretta.")
  })
})

//create a tool that save the code into a file
const save_code = tool(async (input) => {
  console.log("SAVE CODE TOOL");
  const code = input.generated_code;
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
      // Verifica se la directory esiste, altrimenti creala
      const directory = filename.split('/').slice(0, -1).join('/');
      if (directory) {
          try {
              await fs.access(directory);
          } catch (err) {
              // La directory non esiste, creala
              await fs.mkdir(directory, { recursive: true });
              console.log(`Directory creata: ${directory}`);
          }
      }

      // Salva il codice nel file specificato (lo crea se non esiste)
      await fs.writeFile(filename, code, 'utf8');
      return true;
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

export const tools = [is_requirement, classify_language, generate_code, extract_filename, save_code];
export const toolNode = new ToolNode(tools);