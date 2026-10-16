# Polyhedron — Fresh Canon Engine

A clean, model-agnostic foundation for the Polyhedron campaign. Character creation remains the first milestone. The complete Canon is stored in `canon.md` and loaded by the server as a required resource.

## Requirements

- Node.js 18 or newer
- An LLM provider reachable from this computer
- An LLM API endpoint that supports OpenAI-compatible Chat Completions

## Run on Windows

1. Extract this ZIP to a folder, for example `C:\\Polyhedron`.
2. Open PowerShell in that folder.
3. Run:

   ```powershell
   npm start
   ```

4. Open `http://localhost:3000`.
5. Check `http://localhost:3000/api/health` to confirm the full Canon is loaded and the selected provider/model is reachable.

No `npm install` is needed; the server uses Node's built-in modules.

## Automatic model discovery

Normally, simply run `npm start`. Polyhedron searches common local model API ports for a compatible chat-completions endpoint and a model list, then selects an available model automatically. It prefers a model reported as currently loaded when the local service exposes that information; otherwise it selects a model the service reports as available.

- Polyhedron's browser address remains `http://localhost:3000`.
- The model API is a separate service and may use a different local port.
- Check `http://localhost:3000/api/health` to see the selected endpoint/model and discovery status.
- Open `http://localhost:3000/api/llm/discover` to force a fresh discovery scan and see all detected local model endpoints.
- Discovery checks common local ports: `11434, 1234, 8080, 1337, 8000, 5000, 5001`. Change `LLM_DISCOVERY_PORTS` if your service uses another port.

### Remote/cloud models or manual override

A cloud model cannot be found by scanning the local computer: its endpoint and any required credentials are not publicly discoverable from the running model. For remote providers, or to override automatic selection, set the values the provider requires before starting Polyhedron:

```powershell
$env:LLM_BASE_URL="https://your-provider.example/v1"
$env:LLM_API_KEY="your-api-key"
$env:LLM_MODEL="your-model-name"
npm start
```

The API key is optional for local services that do not require one. If only some settings are supplied, discovery attempts to fill the missing endpoint or model when possible. Polyhedron does not need to know these settings when automatic local discovery succeeds.

The model API must support OpenAI-compatible Chat Completions and JSON response mode. Some services expose a compatible endpoint but do not support JSON response mode; such a service may require a future adapter adjustment.

## Canon integrity

- `canon.md` is the complete Canon document supplied for this rebuild, not a summary.
- The server refuses to start if `canon.md` is missing or implausibly short.
- The entire Canon is included in every turn's system prompt. The character's unlocked Expression registry and current campaign state are supplied alongside it.
- `/api/health` reports the loaded Canon character and byte counts.
- If the selected model/provider rejects the prompt due to context limits, the server surfaces the provider error rather than silently truncating the Canon.

## Mechanical authority

The LLM proposes a canonical Expression identity and generates narrative. The browser validates that identity against the canonical Expression registry and character state, consumes the use, and applies the mastery result to persisted campaign state. The model's prose alone cannot update mastery.

### Temporary mastery test mode

Test mode is enabled by default for this initial build. Every **validated and actually activated** Expression awards +100% mastery, even if the use is repetitive or low-impact. This is intentionally temporary so that the first live test can prove that mastery changes in stored state and advances tiers correctly.

Configure it with environment variables before startup:

```powershell
$env:POLYHEDRON_TEST_MODE="true"
$env:POLYHEDRON_TEST_MASTERY="100"
npm start
```

To turn this temporary rule off later:

```powershell
$env:POLYHEDRON_TEST_MODE="false"
npm start
```

Mastery and campaign state are saved in the browser and can be exported/imported as JSON. Export before clearing browser data.

## First live test

1. Complete character creation and select a character with Gale.
2. Enter campaign play.
3. Try: `I use Gale to push the fog away and see what is behind it.`
4. Confirm the DM response and the mastery feedback both appear.
5. Confirm Gale I's mastery on the character sheet reaches 100% (or advances immediately if already partially mastered) and its use count decreases by one.
6. Confirm the tier-up occurs immediately: Gale II unlocks and receives its normal frequency-based daily uses.
7. Export the campaign, refresh the page, and verify the state remains. Import the exported JSON if needed.

If an action does not register as an Expression, check the response and `/api/health`; do not assume that narrative text means a mechanical change occurred.


## Model-selection landing page (current testing build)

Polyhedron now opens on a model-selection screen. It scans common local model-service ports on the machine running the Node.js game server and lists every model returned by each compatible service. Discovery is informational only: **it never selects the first result automatically**. A model must be explicitly selected and pass a `/models` API check before game turns are allowed.

If no model is detected, the page offers a generic cloud configuration form. The model identifier is prefilled with `gemma4:cloud` as a recommendation; the endpoint and API key must be supplied for the provider you use. The API key is held in the running server's memory and is not included in campaign exports. Selection and credentials are cleared when the server process restarts; the landing page asks for a selection again on every page launch.

### Testing through a GitHub Pages frontend

If the frontend is opened from GitHub Pages, enter the publicly reachable **HTTPS** URL of the Node.js game server in the “Polyhedron game server URL” field, then choose “Use server and scan.” The server must be deployed and reachable first. CORS is enabled for this testing build. When using a remote backend, discovery scans the backend host, not the visitor's own computer; cloud configuration is available from the landing page.

**Testing-only limitation:** the selected model and its API key currently live in one server-wide in-memory setting. This is suitable for a single-user experiment, not a multi-user public deployment. Before inviting multiple players, selection and credentials must be isolated per user/session and the backend must add authentication, tighter CORS origin rules, and request limits.

Campaign state is not automatically restored from browser storage. Use the always-visible Import and Export controls to carry campaign state between sessions. The backend URL is stored separately in browser settings and is not part of the campaign JSON.
