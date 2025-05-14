import { ChatOpenAI } from "@langchain/openai";
import { tools } from "./AgentTool.js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
dotenv.config();

// Ottieni il percorso assoluto della directory corrente
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carica il file .env dalla radice del progetto
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const llm_with_tools = new ChatOpenAI({
    model: "gpt-4o-mini",
    openAIApiKey: process.env.OPENAI_API_KEY,
    temperature: 0,
    maxTokens: 1000,
  }).bindTools(tools);
  
export const llm = new ChatOpenAI({
    model: "gpt-4o-mini",
    openAIApiKey: process.env.OPENAI_API_KEY,
    temperature: 0,
    maxTokens: 1000,
  })
