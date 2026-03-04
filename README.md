# AI Agent Template

A repository template for multi-agent AI-driven development workflows — ready to copy into any project or use as the base for a new repo.

## Overview

This template provides a structured foundation for teams (human or AI) that use specialised agent roles to plan, build, test, and document software.
It includes GitHub issue and PR templates, a step-by-step dev workflow guide, and copy-paste-ready role prompts for use with GitHub Copilot Chat, ChatGPT, Claude, or any other LLM assistant.

## Agent Roles

| Agent | Responsibility |
|---|---|
| 📚 Documentation | Keeps README, docs, and wiki current |
| 🔬 Research | Investigates best practices and prior art |
| 🗺️ Tech Lead | Plans work and divides tasks across roles |
| ⚙️ Backend | Implements server-side logic and APIs |
| 🖥️ Frontend | Implements UI/UX and API consumption |
| 🔒 Security | Reviews AuthN/AuthZ, secrets, and data protection |
| 🚀 DevOps | Manages CI/CD, environments, and dependencies |
| 🧪 QA | Defines and executes test plans |

## Quick Start

### 1. Use this template

Click **Use this template** on GitHub to create a new repository, or clone and copy the files into an existing project.

### 2. Open a Work Order

Create a new issue using the **Work Order** template. Fill in the goal, scope, acceptance criteria, and test plan. The template guides you through every required field.

### 3. Invoke agents

For each stage of the workflow, open the relevant agent prompt from [`docs/dev-agents/`](docs/dev-agents/README.md), paste it into your AI assistant, and follow up with the work order content.

Recommended order:
```
Research → Tech Lead → Backend + Frontend → Security → DevOps → QA → Documentation
```

### 4. Open a PR

Use the pull request template to link the work order, complete the verification checklist, and collect agent sign-offs before merging.

## File Reference

| File / Directory | Purpose |
|---|---|
| `.github/ISSUE_TEMPLATE/work-order.yml` | Structured GitHub issue template for work orders |
| `.github/pull_request_template.md` | PR checklist with work order link and agent sign-offs |
| `docs/DEV_WORKFLOW.md` | Full step-by-step workflow guide |
| `docs/WORK_ORDER_TEMPLATE.md` | Manual / offline work order template |
| `docs/dev-agents/README.md` | Agent index and quick-usage guide |
| `docs/dev-agents/<ROLE>.md` | Copy-paste prompt for each agent role |

## Project Structure

```
AIAgentTemplate/
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   └── work-order.yml       # Work order issue template
│   └── pull_request_template.md # PR checklist template
├── docs/
│   ├── DEV_WORKFLOW.md          # Step-by-step workflow guide
│   ├── WORK_ORDER_TEMPLATE.md   # Manual work order template
│   └── dev-agents/
│       ├── README.md            # Agent index and quick start
│       ├── DOCUMENTATION.md     # Documentation Agent prompt
│       ├── RESEARCH.md          # Research Agent prompt
│       ├── TECH_LEAD.md         # Tech Lead Agent prompt
│       ├── BACKEND.md           # Backend Agent prompt
│       ├── FRONTEND.md          # Frontend Agent prompt
│       ├── SECURITY.md          # Security Agent prompt
│       ├── DEVOPS.md            # DevOps Agent prompt
│       └── QA.md                # QA Agent prompt
└── README.md
```

## Contributing

Pull requests are welcome. For major changes, please open a Work Order issue first to discuss what you would like to change.

## License

[MIT](LICENSE)
