# Requirements Engineering and Code Generation AI Agent README

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

- **🔁 Follow-Up Questioning
  Future...


## 📁 Key Technologies

- **JavaScript** (extension logic)
- **LangChain** (agent orchestration)
- **OpenAI** / **LLMs** (code generation)
- **GitHub API** (context retrieval)
- **VS Code Webview API** (UI interface)

## 🚀 Getting Started

1. Clone this repository
2. Add a `.env` file with your GitHub token:
3. ...

**Enjoy!**
