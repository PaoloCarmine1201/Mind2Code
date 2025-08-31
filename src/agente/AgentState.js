// @ts-nocheck
import { Annotation } from "@langchain/langgraph";

export const AgentState = Annotation.Root({
    user_mental_state: Annotation(),
    input: Annotation(),
    messages: Annotation({
        reducer: (x,y) => x.concat(y),
    }),
    repo_context: Annotation(),
    is_requirement: Annotation(),
    refined_requirement: Annotation(),
    language: Annotation(),
    generated_code: Annotation(),
    filename: Annotation(),
    code_saved: Annotation(),
    tool_confidence: Annotation(),
    proposed_followUp: Annotation(),
    improved_code: Annotation(), // Nuovo stato per il codice migliorato
    awaiting_improvement_confirmation: Annotation(),
    improvement_confirmed: Annotation(),
});

