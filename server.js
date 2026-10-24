'use strict';

// Polyhedron's LLM adapter is provider/model agnostic. The application owns game state;
// the model proposes narrative and an Expression interpretation only.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const EXPRESSIONS = require('./expressions.js');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const LLM_BASE_URL = String(process.env.LLM_BASE_URL || '').trim().replace(/\/$/, '');
const CONFIGURED_MODEL = String(process.env.LLM_MODEL || '').trim();
const LLM_API_KEY = String(process.env.LLM_API_KEY || '').trim();
// One model per server. Neither provider URL nor credentials are writable through the API.
function configuredTarget(){
 if(!LLM_BASE_URL||!CONFIGURED_MODEL)return null;
 let parsed;
 try{parsed=new URL(LLM_BASE_URL);}catch{throw new Error('Invalid LLM_BASE_URL in server configuration.');}
 if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password||parsed.search||parsed.hash){
  throw new Error('LLM_BASE_URL must be a clean HTTP(S) model API address.');
 }
 if(process.env.RENDER && parsed.protocol!=='https:')throw new Error('Render requires an HTTPS model API URL.');
 return {baseUrl:LLM_BASE_URL,model:CONFIGURED_MODEL,apiKey:LLM_API_KEY,source:'server-configured'};
}
const FIXED_MODEL=configuredTarget();
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
const PUBLIC_EXPRESSION_NAMES=Object.fromEntries(Object.entries(EXPRESSIONS).map(([glyph,tiers])=>
 [glyph,Object.fromEntries(Object.entries(tiers).filter(([key])=>/^\d+$/.test(key)).map(([key,tier])=>[key,{name:tier.name}]))]
));
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
async function resolveModel(){
 if(!FIXED_MODEL)throw new Error('The game server needs LLM_BASE_URL and LLM_MODEL defined privately in its environment.');
 return FIXED_MODEL;
}
async function callModel(messages, temperature = 0.4) {
  const target = await resolveModel();
  const headers = { 'Content-Type':'application/json' };
  if (target.apiKey || LLM_API_KEY) headers.Authorization = `Bearer ${target.apiKey || LLM_API_KEY}`;
  const body = { model:target.model, stream:false, messages, temperature, response_format:{ type:'json_object' } };
  const response = await fetch(`${target.baseUrl}/chat/completions`, { method:'POST', headers, body:JSON.stringify(body), redirect:'error', signal:AbortSignal.timeout(180000) });
  const text = await response.text();
  if (!response.ok) throw new Error(`LLM request failed (${response.status}). Check the trusted provider configuration on Render.`);
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
    diagnostics:{ endpointConfigured:Boolean(FIXED_MODEL), model:answer.model, canonLoaded:true, testMode:TEST_MODE }
  };
}
const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'Content-Type', 'Access-Control-Allow-Methods':'GET, POST, OPTIONS', 'Access-Control-Max-Age':'600' }); return res.end(); }
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if(url.pathname.startsWith('/api/llm/')){
    return send(res,403,{ok:false,error:'Public model discovery, selection, and credential changes are disabled. The trusted model is configured on the server.'});
  }
  if(req.method==='GET' && url.pathname==='/api/bootstrap'){
    return send(res,FIXED_MODEL?200:503,{
      ok:Boolean(FIXED_MODEL),modelConfigured:Boolean(FIXED_MODEL),model:CONFIGURED_MODEL||null,
      expressionNames:PUBLIC_EXPRESSION_NAMES,
      ...(FIXED_MODEL?{}:{error:'Define LLM_BASE_URL and LLM_MODEL in the Render environment.'})
    });
  }
  if(req.method==='GET' && url.pathname==='/api/health'){
    return send(res,200,{ok:true,canonLoaded:true,modelConfigured:Boolean(FIXED_MODEL),model:CONFIGURED_MODEL||null,testMode:TEST_MODE,testMasteryAward:TEST_MODE?TEST_MASTERY_AWARD:null});
  }
  if (req.method === 'POST' && url.pathname === '/api/turn') {
    try { const payload = await readBody(req); if (!String(payload.action || '').trim()) return send(res, 400, { error:'An action is required.' }); return send(res, 200, await runTurn(payload)); }
    catch (error) { return send(res, 502, { error:error.message, canonLoaded:true, canonCharacters:CANON.length }); }
  }
  let requested;
  try { requested=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname); }
  catch {return send(res,400,{error:'Invalid path'});}
  const safeRootFiles=new Set(['/index.html','/app.js','/rules.js','/styles.css','/favicon.ico']);
  const isAsset=/^\/assets\/[a-zA-Z0-9_.\/-]+\.(?:png|jpg|jpeg|webp|gif|svg|ico)$/i.test(requested)
    && !requested.split('/').some(segment=>segment==='..'||segment.startsWith('.'));
  if(!safeRootFiles.has(requested)&&!isAsset)return send(res,404,{error:'Not found'});
  const filePath=path.resolve(ROOT,`.${requested}`);
  if(!filePath.startsWith(ROOT+path.sep)||!fs.existsSync(filePath)||!fs.statSync(filePath).isFile())return send(res,404,{error:'Not found'});
  const assetMime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.svg':'image/svg+xml','.ico':'image/x-icon'};
  res.writeHead(200,{'Content-Type':MIME[path.extname(filePath)]||assetMime[path.extname(filePath)]||'application/octet-stream','Cache-Control':'no-store'});
  fs.createReadStream(filePath).pipe(res);
});
server.listen(PORT, () => {
  console.log(`Polyhedron server listening at http://localhost:${PORT}`);
  console.log(`Canon loaded: ${Buffer.byteLength(CANON)} bytes / ${CANON.length} characters`);
  console.log(`LLM API: fixed server-defined model ${CONFIGURED_MODEL||'(not configured)'}. Public selection disabled.`);
  console.log(`Temporary mastery test mode: ${TEST_MODE ? `ON (+${TEST_MASTERY_AWARD}% per validated Expression activation)` : 'OFF'}`);
});
