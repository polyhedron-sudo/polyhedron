# Polyhedron DM Engine — Phase 2A

This version connects the player-facing Polyhedron campaign to **Ollama's local service**, using the authenticated `gemma4:cloud` model.

## Requirements
- Node.js 18+
- Ollama installed and already signed in
- Cloud access enabled in Ollama
- `gemma4:cloud` available through Ollama

You do **not** need to create or paste an Ollama API key into this project. The Node server talks to the Ollama service running on your computer, and Ollama handles the existing authentication.

## Setup (Windows PowerShell)

1. Confirm Ollama is working:

```powershell
ollama run gemma4:cloud
```

2. Extract this project.

3. In the project folder, start Polyhedron:

```powershell
npm start
```

4. Open:

```text
http://localhost:3000
```

The server uses `http://localhost:11434/api/chat` by default and requests `gemma4:cloud`.

### Optional configuration

You can override the model or Ollama address for testing:

```powershell
$env:OLLAMA_MODEL="gemma4:cloud"
$env:OLLAMA_URL="http://localhost:11434/api/chat"
npm start
```

## What this milestone does
- Player submits a natural-language action.
- The existing Polyhedron engine performs its current intent/method/Canon validation.
- A committed action is sent to `gemma4:cloud` through the local Ollama service with the relevant Canon and campaign state.
- The DM returns narrative plus durable recollections.
- The response is stored in the local campaign history.
- The LLM does not directly mutate mechanical state.

## Important boundary
This is the first real DM connection, not the finished Game Engine. Mechanical adjudication, richer world state, NPC state, quests, mastery resolution, and structured tool calls will be expanded in later milestones.
