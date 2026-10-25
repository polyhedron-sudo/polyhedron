'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn } = require('node:child_process');
const path = require('node:path');
const PolyhedronRules = require('../rules.js');

let modelReply = {
  narrative:'The wind parts the fog and reveals a narrow stone path.',
  method:'Glyph Expression', expressionUse:null,
  recollections:['A narrow stone path is visible beyond the fog.'],
  establishedFacts:['The fog concealed a narrow stone path.'], unresolvedThreads:[],
  currentSituation:'A narrow stone path is visible beyond the parted fog.'
};
let capturedSystem = '';
const mockProvider = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/v1/models') {
    res.writeHead(200, { 'Content-Type':'application/json' });
    return res.end(JSON.stringify({ data:[{ id:'auto-detected-smoke-model' }] }));
  }
  let raw = '';
  req.on('data', chunk => raw += chunk);
  req.on('end', () => {
    const request = JSON.parse(raw || '{}');
    capturedSystem = request.messages?.[0]?.content || '';
    res.writeHead(200, { 'Content-Type':'application/json' });
    res.end(JSON.stringify({ choices:[{ message:{ content:JSON.stringify(modelReply) } }] }));
  });
});
function freePort() { return new Promise(resolve => { const s = http.createServer(); s.listen(0, '127.0.0.1', () => { const port=s.address().port; s.close(() => resolve(port)); }); }); }
function waitForServer(url, child) {
  return new Promise((resolve, reject) => {
    let tries = 0;
    const timer = setInterval(async () => {
      tries++;
      if (child.exitCode !== null) { clearInterval(timer); reject(new Error('Polyhedron server exited before startup.')); return; }
      try { const r = await fetch(url); if (r.ok) { clearInterval(timer); resolve(); return; } } catch {}
      if (tries > 80) { clearInterval(timer); reject(new Error('Timed out waiting for Polyhedron server.')); }
    }, 100);
  });
}
function sampleState(remainingUses=1) {
  return { phase:'play', campaignContext:{currentSituation:'Fog covers a path.',establishedFacts:[],unresolvedThreads:[],knownEntities:[]}, recollections:[], actionHistory:[], character:{
    hp:10,maxHp:10,voidMarks:0,glyphs:[{name:'Gale',frequency:1,currentTier:1,tiers:[
      {tier:1,mastery:0,dailyUses:1,remainingUses,permanentBonus:0,unlocked:true},
      {tier:2,mastery:0,dailyUses:1,remainingUses:0,permanentBonus:0,unlocked:false},
      {tier:3,mastery:0,dailyUses:1,remainingUses:0,permanentBonus:0,unlocked:false},
      {tier:4,mastery:0,dailyUses:1,remainingUses:0,permanentBonus:0,unlocked:false},
      {tier:5,mastery:0,dailyUses:1,remainingUses:0,permanentBonus:0,unlocked:false}
    ]}]
  }};
}
(async () => {
  await new Promise(resolve => mockProvider.listen(0, '127.0.0.1', resolve));
  const mockPort = mockProvider.address().port;
  const appPort = await freePort();
  const base = `http://127.0.0.1:${appPort}`;
  const child = spawn(process.execPath, ['server.js'], { cwd:path.resolve(__dirname,'..'), env:{...process.env,PORT:String(appPort),LLM_BASE_URL:'',LLM_MODEL:'',LLM_API_KEY:'',LLM_DISCOVERY_PORTS:String(mockPort),LLM_DISCOVERY_TIMEOUT_MS:'250',POLYHEDRON_TEST_MODE:'true',POLYHEDRON_TEST_MASTERY:'100'}, stdio:['ignore','pipe','pipe'] });
  let logs = '';
  child.stdout.on('data', chunk => logs += chunk);
  child.stderr.on('data', chunk => logs += chunk);
  try {
    // Test the real deterministic mastery updater used by the browser application.
    const glyph = { name:'Gale', frequency:2, currentTier:1, tiers:Array.from({length:5}, (_,i)=>({tier:i+1,mastery:0,dailyUses:2,remainingUses:i===0?1:0,permanentBonus:0,unlocked:i===0})) };
    glyph.tiers[0].mastery = 90;
    const advanced = PolyhedronRules.applyMasteryAward({glyphs:[glyph]}, 'Gale', 1, 10);
    assert.equal(advanced.appliedTotal, 10);
    assert.equal(glyph.tiers[0].mastery, 100);
    assert.equal(glyph.tiers[0].dailyUses, 3);
    assert.equal(glyph.tiers[1].unlocked, true);
    assert.equal(glyph.tiers[1].dailyUses, 2);
    assert.equal(glyph.tiers[1].remainingUses, 2);
    assert.equal(glyph.currentTier, 2);
    PolyhedronRules.applyMasteryAward({glyphs:[glyph]}, 'Gale', 1, 10);
    assert.equal(glyph.tiers[0].dailyUses, 3, 'completed tier must not repeatedly earn permanent use bonuses');

    await waitForServer(`${base}/api/health`, child);
    const health = await (await fetch(`${base}/api/health`)).json();
    assert.equal(health.ok, true);
    assert.equal(health.model, null, 'discovery must not silently select the first model');
    assert.equal(health.modelSelected, false, 'the game must start without an explicitly selected model');
    assert.equal(health.canonLoaded, true);
    assert(health.canonBytes > 70000, 'complete Canon should be loaded');
    const discovery = await (await fetch(`${base}/api/llm/discover`)).json();
    assert.equal(discovery.discovered[0].models[0], 'auto-detected-smoke-model');
    const blockedBeforeSelection = await fetch(`${base}/api/turn`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ action:'Look around.', engine:{intent:'committed'}, state:sampleState(1) }) });
    assert.equal(blockedBeforeSelection.status, 502, 'game turns must be blocked until the player selects a model');
    const selection = await fetch(`${base}/api/llm/select`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({baseUrl:`http://127.0.0.1:${mockPort}/v1`,model:'auto-detected-smoke-model',source:'local-discovery'}) });
    const selectionResult = await selection.json();
    assert.equal(selection.status, 200, `explicit model selection should verify successfully: ${selectionResult.error || ''}`);
    assert.equal(selectionResult.selected.model, 'auto-detected-smoke-model');
    const selectedHealth = await (await fetch(`${base}/api/health`)).json();
    assert.equal(selectedHealth.modelSelected, true);
    assert.equal(selectedHealth.model, 'auto-detected-smoke-model');

    const turn = await fetch(`${base}/api/turn`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ action:'I use Gale to push the fog away.', engine:{intent:'committed'}, state:sampleState(1) }) });
    const result = await turn.json();
    assert.equal(turn.status, 200);
    assert.deepEqual(result.expressionUse, {glyph:'Gale',tier:1,name:'Wind',activated:true}, 'explicit named Glyph should still register when model omits expressionUse');
    assert.equal(result.masteryDecision.amount, 100);
    assert.equal(result.diagnostics.canonLoaded, true);
    assert(capturedSystem.includes('<<<POLYHEDRON_CANON_START>>>'));
    assert(capturedSystem.includes('<<<POLYHEDRON_CANON_END>>>'));
    assert(capturedSystem.includes('# 25. GLYPH CANON'));
    assert(capturedSystem.includes('# 1. PURPOSE AND AUTHORITY'));

    modelReply = { ...modelReply, expressionUse:{glyph:'Gale',tier:1,name:'Wind',activated:true}, narrative:'The wind parts the fog.' };
    const blocked = await fetch(`${base}/api/turn`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ action:'I use Gale to push the fog away.', engine:{intent:'committed'}, state:sampleState(0) }) });
    const blockedResult = await blocked.json();
    assert.equal(blockedResult.expressionUse, null, 'empty uses must reject activation');
    assert.equal(blockedResult.masteryDecision.amount, 0, 'invalid activation must not award mastery');
    assert(blockedResult.narrative.includes('no remaining daily uses'));

    const home = await fetch(base);
    assert.equal(home.status, 200);
    console.log('PASS: deterministic mastery and tier advancement work; full Canon is loaded and passed intact to the model; model discovery lists candidates without auto-selecting; turns are blocked until explicit verified selection; explicit Expression fallback awards test mastery; empty-use activation is rejected.');
  } catch (error) {
    console.error(error.stack || error);
    console.error(logs);
    process.exitCode = 1;
  } finally {
    child.kill();
    mockProvider.close();
  }
})();
