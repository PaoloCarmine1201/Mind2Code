# 🧠 **Mind2Code**: A Perspective-Taking Agent for Personalized Requirement Engineering and Code Generation 🔧

This Master’s thesis project is a Visual Studio Code extension structured in two main phases.

The first focuses on requirements engineering, where the user’s initial requirement is personalized through a Theory of Mind (ToM)-driven process. This personalization aims to align the requirement with the inferred mental state, knowledge level, and intentions of the user.

In the second phase, the refined requirement is used to generate source code from natural language specifications. This generation process also leverages the user model inferred during the ToM-based reasoning, allowing the agent to adapt code structure, naming conventions, and abstraction level based on the user’s cognitive profile and the conventions of the repository in which the agent is installed.

The result is a context-aware AI assistant integrated into Visual Studio Code, capable of supporting the developer both in shaping the requirement and in producing high-quality, coherent code.

## 🧠 Project Description

The extension includes an intelligent agent capable of:

- **Extracting repository context** (languages, frameworks, architecture, naming conventions, configuration files, etc.)
- **Profiling the user's programming experience and preferences through an interactive quiz** (Perspective Taking) 
- **Interpreting software requirements written in natural language**
- **Automatically generating, refining, and saving coherent, framework-aligned source code**
- **Respecting existing naming styles and structural organization of the current repository of work** (e.g. MVC, file naming, code style)
- **Providing an interactive chat interface for seamless communication and feedback**

## 🔧 Features

- **🔍 GitHub Repository Scanning via GitHub API**  
  Automatically analyzes the current repository to extract relevant context including languages, frameworks, configuration files, and naming conventions.

- **🧠 User Mental Model Profiling (Mind + Perspective Taking)**  
  Users complete a personalized quiz to define their programming experience, preferences, and expectations. This data shapes how the agent interacts and responds.

- **🧩 LangChain Integration for Tool-Based Reasoning**  
  The agent validates, classifies, and generates code using LangChain tools, while adapting its reasoning to both the repository context and the user profile.

- **💬 Interactive Chat Interface (inside Visual Studio Code)**  
  Users interact with the agent using natural language directly within VS Code, submitting requirements and receiving structured responses.

- **📦 Code Delivery with Context Awareness**  
  Generated code is shown in the chat and can be saved directly into the workspace, following the project's structure, naming, and technology conventions.

- **🔁 Follow-Up Questioning**
  After generating code for a given requirement, the agent proposes concrete improvements in the form of yes/no follow-up questions.
  This ensures users can quickly decide whether to extend the implementation without dealing with vague or open-ended suggestions.


## 📁 Key Technologies

- **JavaScript** (extension logic)
- **LangChain** (agent orchestration)
- **OpenAI** / **LLMs** (code generation)
- **GitHub API** (context retrieval)
- **VS Code Webview API** (UI interface)

## 🚀 Getting Started

**1. Install the Extension**

Open the VS Code command palette (`F1` or `Ctrl+Shift+P` on Windows/Linux, `Cmd+Shift+P` on macOS) and search for:

> **Extensions: Install from VSIX**

Then select the `.vsix` file provided in the repository.

> ℹ️ The `.vsix` file is precompiled, so you don't need to run `npm install` or `npm run compile`.

---

**2. Configure Mind2Code**

Once installed, open the Mind2Code sidebar icon located on the left panel of Visual Studio Code.  
A configuration popup will appear automatically — click **"Configure now"** and fill in the following fields:

- **OpenAI API Key** → your valid OpenAI key.  
- **GPT Model** → e.g. `gpt-4.1-mini`.  
- **GitHub Personal Access Token (PAT)** → required to allow repository analysis.

After entering your credentials, click **“Save Configuration”** to complete the setup.

> 💡 If the popup does not appear, open the command palette (`Ctrl+Shift+P`) and run:  
> `Mind2Code: Restart Configuration`.

---

**3. Start the ToM (Theory of Mind) Quiz**

After completing the configuration, a new popup will appear.  
Click **“Start ToM Quiz”** to begin the cognitive profiling process.  
Complete all the questions and save your profile at the end.  
A JSON file named `YourSurname_ToM_profile.json` will be generated in the `/out` folder.

> If the quiz does not start automatically, you can run the following commands manually:  
> - `Mind2Code: Clear ToM Profile`  
> - `Mind2Code: Start ToM Profile Quiz`

---

**4. Repository Analysis**

Once the ToM profile is created, Mind2Code will automatically start analyzing the currently open repository.  
Wait for the analysis to finish — a confirmation popup will appear in the bottom-right corner of VS Code.

---

**5. Code Generation**

To generate code:
1. Select the requirement you want to implement and paste it into the Mind2Code input field.  
2. Press **Enter** to run the agent and automatically generate the corresponding code.

When the process completes, the generated code will appear in the output panel.

> 🧠 Mind2Code adapts its code generation to your personal ToM profile and the structure of the analyzed repository.

---

**Enjoy!**

