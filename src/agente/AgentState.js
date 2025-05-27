// @ts-nocheck
import { Annotation } from "@langchain/langgraph";

export const AgentState = Annotation.Root({
    input: Annotation(),
    messages: Annotation({
        reducer: (x,y) => x.concat(y),
    }),
    repoContext: Annotation(),
    is_requirement: Annotation(),
    language: Annotation(),
    generated_code: Annotation(),
    filename: Annotation(),
    code_saved: Annotation(),
});

