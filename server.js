'use strict';

// Polyhedron's LLM adapter is provider/model agnostic. The application owns game state;
// the model proposes narrative and an Expression interpretation only.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const dns = require('node:dns').promises;
const net = require('node:net');
const EXPRESSIONS = require('./expressions.js');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const LLM_BASE_URL = String(process.env.LLM_BASE_URL || '').trim().replace(/\/$/, '');
const CONFIGURED_MODEL = String(process.env.LLM_MODEL || '').trim();
const LLM_API_KEY = String(process.env.LLM_API_KEY || '').trim();
const DISCOVERY_TIMEOUT_MS = Math.max(200, Math.min(3000, Number(process.env.LLM_DISCOVERY_TIMEOUT_MS || 800)));
const DISCOVERY_PORTS = [...new Set(String(process.env.LLM_DISCOVERY_PORTS || '11434,1234,8080,1337,8000,5000,5001').split(',').map(x => Number(x.trim())).filter(x => Number.isInteger(x) && x > 0 && x < 65536))];
let discoveryCache = { at:0, results:[] };
// A model is never activated merely because it appears first in discovery.
// The player must explicitly select and verify a target each application launch.
let activeModel = null;
const TEST_MODE = !/^(0|false|off|no)$/i.test(process.env.POLYHEDRON_TEST_MODE || 'true');
const TEST_MASTERY_AWARD = Math.max(1, Math.min(100, Number(process.env.POLYHEDRON_TEST_MASTERY || 100)));
const MAX_BODY = 2_000_000;
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.md':'text/markdown; charset=utf-8', '.json':'application/json; charset=utf-8' };

// On Render, Canon must be present as a private Secret File, not in the repository.
// For local development, a private path can be set with CANON_PATH.
const canonPath = process.env.CANON_PATH || (process.env.RENDER ? '/etc/secrets/canon.md' : path.join(ROOT, 'canon.md'));
if (!fs.existsSync(canonPath)) {
  console.error('FATAL: private canon.md is missing. Polyhedron will not start without its complete Canon.');
  process.exit(1);
}
const CANON = fs.readFileSync(canonPath, 'utf8');
if (CANON.trim().length < 1000) {
  console.error('FATAL: canon.md appears incomplete. Polyhedron will not start.');
  process.exit(1);
}

function send(res, status, obj) {
  res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'Content-Type', 'Access-Control-Allow-Methods':'GET, POST, OPTIONS', 'Cache-Control':'no-store' });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > MAX_BODY) { reject(new Error('Request body too large.')); req.destroy(); }
    });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { reject(new Error('Request body must be valid JSON.')); } });
    req.on('error', reject);
  });
}
function parseJson(raw) {
  const s = String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try { return JSON.parse(s); } catch {}
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch {} }
  throw new Error('The selected model did not return the required JSON response. Try again or choose a model that follows structured-output instructions.');
}
function modelIds(json) {
  const ids = [];
  if (Array.isArray(json?.data)) for (const item of json.data) if (item?.id) ids.push(String(item.id));
  if (Array.isArray(json?.models)) for (const item of json.models) {
    const id = item?.name || item?.model;
    if (id) ids.push(String(id));
  }
  return [...new Set(ids)];
}
async function getJson(url, timeout = DISCOVERY_TIMEOUT_MS) {
  try {
    const response = await fetch(url, { signal:AbortSignal.timeout(timeout) });
    if (!response.ok) return null;
    return await response.json();
  } catch { return null; }
}
async function probeLocalEndpoint(port) {
  const origin = `http://127.0.0.1:${port}`;
  // Prefer currently loaded models where the service exposes that information.
  const [loaded, tags, openAi] = await Promise.all([
    getJson(`${origin}/api/ps`), getJson(`${origin}/api/tags`), getJson(`${origin}/v1/models`)
  ]);
  // Union all exposed model lists: loaded-only endpoints must not hide other available models.
  const ids = [...new Set([...modelIds(loaded), ...modelIds(openAi), ...modelIds(tags)])];
  if (!ids.length) return null;
  return { baseUrl:`${origin}/v1`, model:ids[0], models:ids, loadedModels:modelIds(loaded), source:'local-discovery', port };
}
async function discoverLocalModels(force = false) {
  if (!force && Date.now() - discoveryCache.at < 10000) return discoveryCache.results;
  const found = await Promise.all(DISCOVERY_PORTS.map(probeLocalEndpoint));
  discoveryCache = { at:Date.now(), results:found.filter(Boolean) };
  return discoveryCache.results;
}
async function resolveModel() {
  if (activeModel) return { ...activeModel, source:activeModel.source || 'explicit-selection' };
  throw new Error('No language model has been selected for this session. Choose a detected model or configure a cloud model on the Polyhedron landing page.');
}
function isPrivateIp(address) {
  if (net.isIPv4(address)) {
    const [a,b] = address.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (net.isIPv6(address)) {
    const ip = address.toLowerCase();
    return ip === '::1' || ip === '::' || ip.startsWith('fc') || ip.startsWith('fd') || /^fe[89ab]/.test(ip) || ip.startsWith('::ffff:127.') || ip.startsWith('::ffff:10.') || ip.startsWith('::ffff:192.168.');
  }
  return true;
}
async function assertPublicCloudEndpoint(baseUrl, source) {
  if (source === 'local-discovery' || source === 'environment-configured') return;
  const host = new URL(baseUrl).hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('Cloud endpoints must use a public hostname. Select a discovered local model for local services.');
  const addresses = net.isIP(host) ? [{address:host}] : await dns.lookup(host, { all:true }).catch(() => []);
  if (!addresses.length || addresses.some(item => isPrivateIp(item.address))) throw new Error('The cloud endpoint must resolve to a public IP address. Private and local network endpoints are blocked for safety.');
}
async function verifyTarget(target) {
  const baseUrl = String(target?.baseUrl || '').trim().replace(/\/$/, '');
  const model = String(target?.model || '').trim();
  const apiKey = String(target?.apiKey || '').trim();
  const source = target?.source || 'cloud-configured';
  if (!/^https?:\/\//i.test(baseUrl)) throw new Error('Enter a valid model API base URL, including https:// or http://.');
  if (!model) throw new Error('Enter or select a model identifier.');
  if (source === 'local-discovery') {
    const known = await discoverLocalModels(true);
    if (!known.some(item => item.baseUrl === baseUrl && item.models.includes(model))) throw new Error('That local model is no longer in the discovery results. Rescan and select an available model.');
  } else {
    await assertPublicCloudEndpoint(baseUrl, source);
  }
  const headers = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  let response;
  try { response = await fetch(`${baseUrl}/models`, { headers, signal:AbortSignal.timeout(8000) }); }
  catch (error) { throw new Error(`Could not reach the model API at ${baseUrl}. Check the endpoint, network access, and whether the service is running.`); }
  if (!response.ok) throw new Error(`The model API check failed (${response.status}). Check the endpoint and credentials.`);
  let json;
  try { json = await response.json(); } catch { throw new Error('The model API did not return a valid model list.'); }
  const ids = modelIds(json);
  if (ids.length && !ids.includes(model)) throw new Error(`The API responded, but did not list '${model}'. Available models: ${ids.join(', ')}.`);
  return { baseUrl, model, apiKey, source, verifiedAt:new Date().toISOString() };
}
async function callModel(messages, temperature = 0.4) {
  const target = await resolveModel();
  const headers = { 'Content-Type':'application/json' };
  if (target.apiKey || LLM_API_KEY) headers.Authorization = `Bearer ${target.apiKey || LLM_API_KEY}`;
  const body = { model:target.model, stream:false, messages, temperature, response_format:{ type:'json_object' } };
  const response = await fetch(`${target.baseUrl}/chat/completions`, { method:'POST', headers, body:JSON.stringify(body), signal:AbortSignal.timeout(180000) });
  const text = await response.text();
  if (!response.ok) throw new Error(`LLM request failed (${response.status}) at ${target.baseUrl}: ${text.slice(0, 700)}`);
  let json;
  try { json = JSON.parse(text); } catch { throw new Error('The model provider returned an invalid response.'); }
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('The model provider returned an empty response.');
  return { content, model:target.model, baseUrl:target.baseUrl, source:target.source };
}
function getAvailableExpressions(state) {
  const result = {};
  for (const glyph of state?.character?.glyphs || []) {
    const registry = EXPRESSIONS[String(glyph.name || '').toUpperCase()];
    if (!registry) continue;
    result[glyph.name] = { theme:registry.theme, tiers:{} };
    for (const tier of glyph.tiers || []) {
      if (!tier.unlocked) continue;
      const expression = registry[String(tier.tier)];
      if (expression) result[glyph.name].tiers[String(tier.tier)] = { name:expression.name, description:expression.description };
    }
  }
  return result;
}
function validateExpressionUse(use, state) {
  if (use == null) return { valid:true, use:null, reason:'' };
  if (typeof use !== 'object') return { valid:false, use:null, reason:'The model returned an invalid Expression declaration.' };
  if (use.activated === false) return { valid:true, use:null, reason:'' };
  const glyphName = String(use.glyph || '').trim();
  const tierNumber = Number(use.tier);
  const expressionName = String(use.name || '').trim();
  if (!glyphName || !Number.isInteger(tierNumber) || tierNumber < 1 || tierNumber > 5 || !expressionName) return { valid:false, use:null, reason:'The declared Expression did not match a complete canonical Glyph/tier/Expression identity.' };
  const glyph = (state?.character?.glyphs || []).find(g => String(g.name).toLowerCase() === glyphName.toLowerCase());
  if (!glyph) return { valid:false, use:null, reason:`${glyphName} is not one of this character's three chosen Glyphs.` };
  const tier = (glyph.tiers || [])[tierNumber - 1];
  const expression = EXPRESSIONS[String(glyph.name).toUpperCase()]?.[String(tierNumber)];
  if (!expression || expression.name.toLowerCase() !== expressionName.toLowerCase()) return { valid:false, use:null, reason:'The declared Expression does not match the canonical Expression registry.' };
  if (!tier?.unlocked) return { valid:false, use:null, reason:`${glyph.name} ${['','I','II','III','IV','V'][tierNumber]} is not unlocked.` };
  if (Number(tier.remainingUses) <= 0) return { valid:false, use:null, reason:`${glyph.name} ${['','I','II','III','IV','V'][tierNumber]} has no remaining daily uses.` };
  return { valid:true, use:{ glyph:glyph.name, tier:tierNumber, name:expression.name, activated:true }, reason:'' };
}
function inferExplicitExpressionFallback(action, state) {
  // Conservative, deterministic fallback for explicit declarations like "I use Gale".
  // It only acts when the player names a chosen Glyph and exactly one usable tier is unlocked.
  const text = String(action || '').toLowerCase();
  if (!/\b(use|using|activate|activating|cast|casting|invoke|invoking|manifest|manifesting|try|attempt|attempting)\b/.test(text)) return null;
  for (const glyph of state?.character?.glyphs || []) {
    const name = String(glyph.name || '');
    if (!name || !new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) continue;
    const available = (glyph.tiers || []).filter(t => t.unlocked && Number(t.remainingUses) > 0)
      .map(t => ({ tier:t, expression:EXPRESSIONS[String(name).toUpperCase()]?.[String(t.tier)] }))
      .filter(x => x.expression);
    const named = available.find(x => text.includes(x.expression.name.toLowerCase()));
    if (named) return { glyph:name, tier:named.tier.tier, name:named.expression.name, activated:true };
    if (available.length === 1) return { glyph:name, tier:available[0].tier.tier, name:available[0].expression.name, activated:true };
  }
  return null;
}
function cleanStrings(value) {
  return Array.isArray(value) ? value.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim()).slice(0, 100) : [];
}
async function runTurn(payload) {
  const state = payload.state || {};
  const intent = payload.engine?.intent || 'committed';
  const available = getAvailableExpressions(state);
  const system = `You are the dynamic world director and narrator for the Polyhedron game. The complete authoritative Polyhedron Canon is included below, in full. Do not substitute a summary for it. Consult the complete text and the character-specific Expression registry for every relevant decision. If the Canon does not support a rule or capability, do not invent it.

APPLICATION RESPONSIBILITIES:
- The application, not you, owns and updates authoritative mechanical state: uses, mastery, tiers, HP, Void Marks, costs, prerequisites, durations, and other rules-based values.
- You may propose which canonical Expression the player's committed action invokes, but return only an exact Glyph/tier/Expression in the supplied available registry. If none is activated, return null.
- Do not say that mastery, uses, HP, or other mechanical state changed. The application will append its own verified mechanical feedback.
- Do not invent hidden facts as established facts unless they have genuinely become known in play. Separate character knowledge from world truth.
- Preserve continuity using the supplied campaign state. Player agency is paramount: narrate consequences and opportunities, but do not choose the player's decisions.
- Return valid JSON only, with fields: narrative (string), method (string), expressionUse (null or {glyph,tier,name,activated}), recollections (array of strings), establishedFacts (array of strings), unresolvedThreads (array of strings), currentSituation (string).

CHARACTER'S AVAILABLE CANONICAL EXPRESSIONS:
${JSON.stringify(available, null, 2)}

COMPLETE CANON — ALL SECTIONS FOLLOW:
<<<POLYHEDRON_CANON_START>>>
${CANON}
<<<POLYHEDRON_CANON_END>>>`;
  const user = `PLAYER INTENT: ${intent}\nPLAYER ACTION: ${String(payload.action || '')}\n\nAUTHORITATIVE CURRENT CAMPAIGN STATE (read-only; do not claim to modify it):\n${JSON.stringify(state, null, 2)}\n\nInterpret the player's action under the complete Canon. If a committed, actually performed canonical Expression is being activated, return its exact registry identity. Consideration or conditional intent is not an activation. Respond with a coherent, situation-specific narrative and JSON fields exactly as instructed.`;
  const answer = await callModel([{ role:'system', content:system }, { role:'user', content:user }], 0.4);
  const parsed = parseJson(answer.content);
  let proposedUse = parsed.expressionUse;
  if (intent === 'committed' && proposedUse == null) proposedUse = inferExplicitExpressionFallback(payload.action, state);
  const validation = intent === 'committed' ? validateExpressionUse(proposedUse, state) : { valid:true, use:null, reason:'' };
  const expressionUse = validation.use;
  let narrative = typeof parsed.narrative === 'string' && parsed.narrative.trim() ? parsed.narrative.trim() : 'The world holds its breath for a moment, awaiting your next decision.';
  if (!validation.valid) narrative = `The action was not activated because the game engine could not validate the Expression: ${validation.reason} No Expression use was consumed and no mastery was awarded. Please choose another action or clarify your intent.`;
  const masteryDecision = expressionUse && TEST_MODE ? {
    status:'test_mode', eligible:true, amount:TEST_MASTERY_AWARD,
    reason:`Temporary test mode: every validated Expression activation awards +${TEST_MASTERY_AWARD}% mastery.`
  } : { status:expressionUse ? 'canon_adjudication_required' : 'not_applicable', eligible:false, amount:0, reason:'' };
  return {
    narrative,
    method:typeof parsed.method === 'string' ? parsed.method : (expressionUse ? 'Glyph Expression' : 'Other established method'),
    expressionUse,
    expressionValidation:{ valid:validation.valid, reason:validation.reason },
    masteryDecision,
    recollections:cleanStrings(parsed.recollections),
    establishedFacts:cleanStrings(parsed.establishedFacts),
    unresolvedThreads:cleanStrings(parsed.unresolvedThreads),
    currentSituation:typeof parsed.currentSituation === 'string' ? parsed.currentSituation.trim() : '',
    diagnostics:{ endpointConfigured:Boolean(answer.baseUrl), endpoint:answer.baseUrl, model:answer.model, modelSource:answer.source, canonLoaded:true, canonCharacters:CANON.length, canonBytes:Buffer.byteLength(CANON), testMode:TEST_MODE }
  };
}
const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'Content-Type', 'Access-Control-Allow-Methods':'GET, POST, OPTIONS', 'Access-Control-Max-Age':'600' }); return res.end(); }
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/api/llm/discover') {
    try {
      const discovered = await discoverLocalModels(true);
      const configured = LLM_BASE_URL && CONFIGURED_MODEL ? [{ baseUrl:LLM_BASE_URL, model:CONFIGURED_MODEL, models:[CONFIGURED_MODEL], source:'environment-configured', configured:true }] : [];
      return send(res, 200, { ok:true, selected:activeModel ? { baseUrl:activeModel.baseUrl, model:activeModel.model, source:activeModel.source } : null, discovered, configured });
    } catch (error) { return send(res, 200, { ok:false, selected:null, discovered:[], configured:[], error:error.message }); }
  }
  if (req.method === 'POST' && url.pathname === '/api/llm/select') {
    try {
      const payload = await readBody(req);
      const target = {
        baseUrl:payload.baseUrl || LLM_BASE_URL,
        model:payload.model || CONFIGURED_MODEL,
        apiKey:payload.apiKey || LLM_API_KEY,
        source:payload.source || 'explicit-selection'
      };
      const verified = await verifyTarget(target);
      activeModel = verified;
      return send(res, 200, { ok:true, selected:{ baseUrl:activeModel.baseUrl, model:activeModel.model, source:activeModel.source }, message:`Connected to ${activeModel.model}.` });
    } catch (error) { activeModel = null; return send(res, 400, { ok:false, error:error.message }); }
  }
  if (req.method === 'POST' && url.pathname === '/api/llm/clear') {
    activeModel = null;
    return send(res, 200, { ok:true, selected:null });
  }
  if (req.method === 'GET' && url.pathname === '/api/health') {
    return send(res, 200, { ok:true, canonLoaded:true, canonCharacters:CANON.length, canonBytes:Buffer.byteLength(CANON), endpointConfigured:Boolean(activeModel), endpoint:activeModel?.baseUrl || null, model:activeModel?.model || null, modelSelected:Boolean(activeModel), modelSource:activeModel?.source || null, discoveredLocalModels:(await discoverLocalModels()).map(x=>({baseUrl:x.baseUrl,models:x.models,source:x.source,port:x.port})), testMode:TEST_MODE, testMasteryAward:TEST_MODE ? TEST_MASTERY_AWARD : null });
  }
  if (req.method === 'POST' && url.pathname === '/api/turn') {
    try { const payload = await readBody(req); if (!String(payload.action || '').trim()) return send(res, 400, { error:'An action is required.' }); return send(res, 200, await runTurn(payload)); }
    catch (error) { return send(res, 502, { error:error.message, canonLoaded:true, canonCharacters:CANON.length }); }
  }
  let requested;
  try { requested = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname); }
  catch { return send(res, 400, { error:'Invalid path' }); }
  // Never serve the Canon, hidden files, or secrets from the public web root.
  if (requested.split('/').some(part => part.startsWith('.')) || requested.toLowerCase() === '/canon.md') return send(res, 404, { error:'Not found' });
  const filePath = path.resolve(ROOT, `.${requested}`);
  if (!filePath.startsWith(ROOT + path.sep) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return send(res, 404, { error:'Not found' });
  res.writeHead(200, { 'Content-Type':MIME[path.extname(filePath)] || 'application/octet-stream', 'Cache-Control':'no-store' });
  fs.createReadStream(filePath).pipe(res);
});
server.listen(PORT, () => {
  console.log(`Polyhedron server listening at http://localhost:${PORT}`);
  console.log(`Canon loaded: ${Buffer.byteLength(CANON)} bytes / ${CANON.length} characters`);
  console.log('LLM API: explicit model selection required; discovery never auto-selects a model.');
  console.log(`Temporary mastery test mode: ${TEST_MODE ? `ON (+${TEST_MASTERY_AWARD}% per validated Expression activation)` : 'OFF'}`);
});
