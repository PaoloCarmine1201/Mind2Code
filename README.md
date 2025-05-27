# Requirements Engineering and Code Generation AI Agent README

This Master's thesis project is structured in two main phases. The first focuses on **requirements engineering**, where the user's initial requirement is personalized through a Theory of Mind (ToM)-driven process to better align with their mental state. The refined requirement is then used in the second phase, which involves **generating source code from natural language software requirements** by leveraging the structure and conventions of the repository in which the agent is installed. 

The result is a context-aware AI assistant integrated into Visual Studio Code, capable of supporting the developer both in shaping the requirement and in producing high-quality, coherent code.

## 🧠 Project Description

The extension includes an intelligent agent capable of:

- Extracting repository context (language, architecture, naming conventions, configuration files, etc.)
- Interpreting software requirements written in natural language
- Automatically generating and saving coherent, framework-aligned source code
- Respecting existing naming styles and structural organization (e.g., MVC)

## 🔧 Features

- GitHub repository scanning via GitHub API
- Dynamic context profiling (`repoProfile`)
- Integration with LangChain tools (e.g., `is_requirement`, `generate_code`, `save_code`)
- System prompt construction with full awareness of project conventions
- Interactive chat interface inside Visual Studio Code

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
