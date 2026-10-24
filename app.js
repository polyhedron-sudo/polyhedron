const GLYPHS={1:'Witness',2:'Crown',3:'Veil',4:'Maw',5:'Lance',6:'Mirror',7:'Chain',8:'Morph',9:'Catalyst',10:'Ember',11:'Tides',12:'Stone',13:'Gale',14:'Bloom',15:'Shade',16:'Halo',17:'Ash',18:'Void',19:'Pulse',20:'Witness'};
// Void Mark purchases are permanent character abilities, not per-use fuel.
const VOID_TIERS=[
 {tier:1,name:'Void Step',cost:2,requires:[],description:'Teleport to any location within visual range.'},
 {tier:2,name:'Void Severance',cost:4,requires:[1],description:'Suppress or cancel an existing effect within visual range.'},
 {tier:3,name:'Temper Causality',cost:6,requires:[2],description:'Tier III Void ability.'},
 {tier:4,name:'Touch the Void',cost:8,requires:[],description:'Tier IV Void ability.'},
 {tier:5,name:'Initiate Gate',cost:10,requires:[],description:'Tier V Void ability; initiating the Gate ends the journey.'}
];
function purchasedVoidTiers(){return Array.isArray(state.character?.voidTiers)?state.character.voidTiers:[];}
function purchasedVoidNames(){return VOID_TIERS.filter(v=>purchasedVoidTiers().includes(v.tier)).map(v=>v.name);}
function voidPurchaseEligibility(v){
 const c=state.character;
 if(!c)return {ok:false,reason:'No character is initialized.'};
 if(purchasedVoidTiers().includes(v.tier))return {ok:false,reason:'Already purchased'};
 if(v.requires.some(t=>!purchasedVoidTiers().includes(t)))return {ok:false,reason:`Requires ${v.requires.map(t=>VOID_TIERS.find(x=>x.tier===t)?.name||'Tier '+t).join(', ')}`};
 if((Number(c.voidMarks)||0)<v.cost)return {ok:false,reason:`Need ${v.cost} Void Marks`};
 return {ok:true,reason:'Available'};
}
function buyVoidTier(tier){
 const v=VOID_TIERS.find(x=>x.tier===tier);
 if(!v||!voidPurchaseEligibility(v).ok)return;
 if(v.tier===5&&!confirm('Initiate Gate ends the journey. Purchase this tier?'))return;
 state.character.voidMarks-=v.cost;
 state.character.voidTiers.push(v.tier);
 state.character.voidTiers.sort((a,b)=>a-b);
 if(v.tier===5)state.phase='gate-ending';
 save();render();
}
const OPENING=[
'The world is older than anyone remembers.',
'Kingdoms have risen and disappeared beneath their own ruins. Roads have become rivers, rivers have changed their courses, and cities have been built over the bones of those that came before them. People trade, worship, fight, love, fear, and die much as they always have.',
'And scattered throughout that history are stories of people who were different.',
'Some were blessed. Some were cursed. Some were heroes. Others became monsters.',
'But the oldest stories share a single detail.',
'The Polyhedron.',
'No one knows who made it, or why it appears where it does. It has been found in temples and ruins, beneath mountains and in forgotten chambers. Wherever it appears, history has a habit of changing.',
'Those who touch it do not all become the same.',
'Something within the Polyhedron answers them.',
'Three Glyphs.',
'Three possibilities.',
'Three paths that no one else can choose for them.',
'You have heard the stories.',
'You have wondered whether any of them were true.',
'The Polyhedron rests before you in the silence.',
'Dark. Impossible. Perfectly still.',
'There is only one way to find out.',
'You reach toward it.',
'And place your hand upon the Polyhedron.'
];
const defaultState=()=>({schemaVersion:4,phase:'opening',method:null,rolls:[],functional:[],witness:[],voidMarks:0,selected:[],character:null,lastSave:null,actions:[],pendingActions:[],actionHistory:[],recollections:[],activeEffects:[],expressionHistory:[],masteryHistory:[],lastEngineResult:null,campaignContext:{currentSituation:'',establishedFacts:[],unresolvedThreads:[],knownEntities:[]}});
let state=defaultState();
let modelReady=false;
let discoveredModels=[];
let discoveryError='';
const API_BASE_KEY='polyhedron-api-base-url';
let apiBase=localStorage.getItem(API_BASE_KEY)||'';
async function apiFetch(route,options={}){const base=(apiBase||'').trim().replace(/\/$/,'');return fetch(base+route,options);}
const app=document.getElementById('app');
function save(){state.lastSave=new Date().toLocaleTimeString();}
function esc(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function roman(n){return ['0','I','II','III','IV','V'][n]}
function migrateCharacter(){
 if(!state.character){state.schemaVersion=4;return;}
 state.character.glyphs=state.character.glyphs.map(g=>{
  if(g.tiers)return g;
  const tiers=Array.from({length:5},(_,i)=>({tier:i+1,mastery:i===0?(g.mastery||0):0,dailyUses:g.frequency+(i===0&&g.tier===1?0:0),remainingUses:i===0?(g.remainingUses??g.dailyUses):0,permanentBonus:0,unlocked:i===0}));
  return {...g,tiers,currentTier:g.tier||1};
 });
 state.character.voidTiers=Array.isArray(state.character.voidTiers)?[...new Set(state.character.voidTiers.map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=5))].sort((a,b)=>a-b):[];
 state.pendingActions ||= []; state.actionHistory ||= []; state.recollections ||= []; state.activeEffects ||= []; state.expressionHistory ||= []; state.masteryHistory ||= []; state.lastEngineResult ||= null;
 state.campaignContext ||= {currentSituation:'',establishedFacts:[],unresolvedThreads:[],knownEntities:[]};
 state.campaignContext.currentSituation ||= ''; state.campaignContext.establishedFacts ||= []; state.campaignContext.unresolvedThreads ||= []; state.campaignContext.knownEntities ||= [];
 state.schemaVersion=4;
}
migrateCharacter();
function render(){
 if(!modelReady)return modelSelection();
 const topbar=document.querySelector('.topbar');
 const title=document.getElementById('topbarTitle');
 if(topbar)topbar.style.display='';
 if(title){
  title.textContent=state.phase==='play'?'Campaign':state.phase==='opening'?'Campaign Opening':'Campaign';
 }
 if(state.phase==='opening')return opening();
 if(state.phase==='method')return method();
 if(state.phase==='rolling')return rolling();
 if(state.phase==='selection')return selection();
 if(state.phase==='complete')return complete();
 if(state.phase==='void-purchase')return voidPurchase();
 if(state.phase==='gate-ending')return gateEnding();
 if(state.phase==='awakening')return awakening();
 if(state.phase==='play')return play();
}
function modelSelection(){
 const title=document.getElementById('topbarTitle');if(title)title.textContent='Model Selection';
 const local=discoveredModels.filter(endpoint=>endpoint.source!=='environment-configured').flatMap((endpoint,endpointIndex)=>(endpoint.models||[]).map(model=>({baseUrl:endpoint.baseUrl,model,source:'local-discovery',port:endpoint.port,key:`local-${endpoint.port||endpointIndex}-${model}`})));
 const configured=discoveredModels.filter(x=>x.configured).flatMap((x,i)=>(x.models||[x.model]).map(model=>({baseUrl:x.baseUrl,model,source:'environment-configured',key:`configured-${i}-${model}`})));
 const all=[...local,...configured];
 app.innerHTML=`<section class="panel model-landing"><div class="eyebrow">POLYHEDRON · CONNECTION SETUP</div><h2>Choose your game master</h2><p class="instruction">Polyhedron scans compatible model services on the server running this application. Choose a detected model or configure a cloud endpoint. The game remains unavailable until a model connection is verified.</p>
 <div class="backend-config"><label>Polyhedron game server URL <span class="muted small">Leave blank when opening the app directly from the Node server.</span><input id="backendUrl" type="url" value="${esc(apiBase)}" placeholder="https://your-polyhedron-server.example"></label><button class="secondary" id="connectBackend">Use server and scan</button></div>
 <div class="model-toolbar"><div><strong>Detected models</strong><div class="muted small">${all.length?`${all.length} model option${all.length===1?'':'s'} found`:'No usable models detected yet'}</div></div><button class="secondary" id="rescanModels">↻ Rescan</button></div>
 <div class="model-list">${all.map((m,i)=>`<label class="model-option"><input type="radio" name="modelChoice" value="${i}"><span class="model-option-main"><strong>${esc(m.model)}</strong><small>${esc(m.baseUrl)}${m.port?` · port ${m.port}`:''}</small></span><span class="model-state">Detected</span></label>`).join('')||`<div class="notice">No local model API was found on the scanned ports. Start a model service and rescan, or configure a cloud model below.</div>`}</div>
 <button class="primary" id="useDetected" ${all.length?'':'disabled'}>Connect selected model</button>
 <div id="modelMessage" class="notice model-message ${discoveryError?'warning':''}">${esc(discoveryError||'Choose a detected model, or configure a cloud model below.')}</div>
 <div class="divider"></div><div class="cloud-heading"><div><h3>Configure a cloud model</h3><p class="muted">Recommended starting point: <code>gemma4:cloud</code>. This is a suggestion, not a claim that it is already available.</p></div><span class="cloud-tag">Cloud option</span></div>
 <div class="cloud-form"><label>API base URL<input id="cloudUrl" type="url" placeholder="https://ollama.com/v1"></label><label>Model identifier<input id="cloudModel" type="text" value="gemma4:cloud" placeholder="e.g. gemma4:cloud"></label><label>API key<input id="cloudKey" type="password" autocomplete="off" placeholder="Provider API key (kept in server memory only)"></label><button class="primary" id="connectCloud">Verify and connect cloud model</button></div>
 <p class="muted small">If the model is not running or credentials are missing, Polyhedron will explain what needs attention. Start/configure the model outside the browser if needed, then retry. Model selection is not stored in campaign exports.</p></section>`;
 document.getElementById('rescanModels').onclick=()=>scanModels(true);
 document.getElementById('connectBackend').onclick=()=>{const value=document.getElementById('backendUrl').value.trim().replace(/\/$/,'');if(value&&!/^https?:\/\//i.test(value))return showModelMessage('The server URL must begin with https:// or http://.','warning');apiBase=value;localStorage.setItem(API_BASE_KEY,apiBase);scanModels(true)};
 document.getElementById('useDetected').onclick=async()=>{const choice=document.querySelector('input[name="modelChoice"]:checked');if(!choice)return showModelMessage('Select a model first.','warning');const m=all[Number(choice.value)];await selectModel(m)};
 document.getElementById('connectCloud').onclick=async()=>{const baseUrl=document.getElementById('cloudUrl').value.trim();const model=document.getElementById('cloudModel').value.trim();const apiKey=document.getElementById('cloudKey').value.trim();if(!baseUrl||!model)return showModelMessage('Enter the cloud API base URL and model identifier.','warning');await selectModel({baseUrl,model,apiKey,source:'cloud-configured'})};
}
function showModelMessage(message,kind=''){const el=document.getElementById('modelMessage');if(el){el.textContent=message;el.className='notice model-message '+(kind==='warning'?'warning':kind==='success'?'success':'')}}
async function scanModels(force=false){
 const button=document.getElementById('rescanModels');if(button){button.disabled=true;button.textContent='Scanning…'}
 discoveryError='';
 try{const response=await apiFetch('/api/llm/discover',{cache:'no-store'});const data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||'Model discovery failed.');discoveredModels=[...(data.discovered||[]),...(data.configured||[])];}
 catch(err){discoveredModels=[];discoveryError=`Could not contact the Polyhedron server: ${err.message}. If this page is hosted on GitHub Pages, enter the reachable HTTPS game-server URL above, then choose Use server and scan.`}
 modelSelection();
}
async function selectModel(model){
 showModelMessage(`Verifying ${model.model}…`);
 const buttons=[document.getElementById('useDetected'),document.getElementById('connectCloud')].filter(Boolean);buttons.forEach(b=>{b.disabled=true});
 try{
  const response=await apiFetch('/api/llm/select',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(model)});const data=await response.json();
  if(!response.ok||!data.ok)throw new Error(data.error||'The selected model could not be verified.');
  modelReady=true;render();
 }catch(err){showModelMessage(`${err.message} No model was selected, so the game cannot start. Check the URL/model/credentials, launch the model if necessary, then retry or rescan.`,'warning')}
 finally{buttons.forEach(b=>{b.disabled=false})}
}
function opening(){app.innerHTML=`<section class="panel opening"><div class="stephead"><h2>Campaign Opening</h2><span class="step">01 / 06</span></div>${OPENING.map((p,i)=>`<p class="${i===0?'lead':''}">${p}</p>`).join('')}<div class="divider"></div><div class="actions"><button class="primary" id="begin">Continue</button></div></section>`;document.getElementById('begin').onclick=()=>{state.phase='method';save();render()}}
function method(){app.innerHTML=`<section class="panel"><div class="stephead"><h2>Choose your Polyhedron rolling method</h2><span class="step">02 / 06</span></div><p class="instruction">The campaign opening is complete. Choose how the nine functional results will be generated.</p><div class="choices"><button class="choice" id="player"><strong>1 — Player Rolls</strong><span>You provide each Polyhedron result one at a time. The engine resolves each result before asking for the next.</span></button><button class="choice" id="engine"><strong>2 — LLM Rolls</strong><span>The engine performs the entire Polyhedron sequence automatically, revealing each result until nine functional Glyph results exist.</span></button></div></section>`;document.getElementById('player').onclick=()=>startRolling('player');document.getElementById('engine').onclick=()=>startRolling('engine')}
function startRolling(method){state.method=method;state.phase='rolling';state.rolls=[];state.functional=[];state.witness=[];state.voidMarks=0;state.selected=[];state.character=null;state.actions=[];state.pendingActions=[];state.actionHistory=[];state.recollections=[];state.activeEffects=[];state.lastEngineResult=null;save();render()}
function applyRoll(n){const g=GLYPHS[n];state.rolls.push({n,g});if(n===1||n===20)state.witness.push(n);else if(n===18)state.voidMarks++;else state.functional.push(g);save();if(state.functional.length>=9){state.phase='selection';save();render()}else render()}
function roll(){applyRoll(Math.floor(Math.random()*20)+1)}
function submitPlayerRoll(){const v=Number(document.getElementById('playerRoll').value);if(v<1||v>20||!Number.isInteger(v)){document.getElementById('err').textContent='Enter a whole number from 1 to 20.';return}applyRoll(v)}
function rolling(){const next=9-state.functional.length;const last=state.rolls[state.rolls.length-1];let outcome='Awaiting roll';if(last){if(last.n===1||last.n===20)outcome='Witness — recorded, then rerolled';else if(last.n===18)outcome='Void — +1 Void Mark, then rerolled';else outcome=esc(last.g)+' — functional result recorded'}app.innerHTML=`<section class="panel"><div class="stephead"><h2>Polyhedron Character Creation</h2><span class="step">03 / 06</span></div><div class="roll-layout"><div class="die"><div><div class="number">${last?last.n:'—'}</div><div class="label">${outcome}</div></div></div><div class="roll-side"><div class="notice">Nine functional Glyph results are required. Witness results are recorded and rerolled. Void adds one Void Mark and rerolls. <strong>${next}</strong> functional result${next===1?'':'s'} remaining.</div>${state.method==='player'?`<div><label class="muted">Player result</label><div style="display:flex;gap:9px;margin-top:7px"><input id="playerRoll" type="number" min="1" max="20" placeholder="1–20" style="flex:1;background:#0d0f13;border:1px solid var(--line);border-radius:8px;color:white;padding:11px"><button class="primary" id="submit">Record Roll</button></div><div id="err" class="muted" style="margin-top:7px"></div></div>`:`<button class="primary" id="auto">Roll Polyhedron</button>`}<div><div class="muted" style="margin-bottom:8px">Functional results</div><div class="roll-log">${state.functional.map((g,i)=>`<div class="roll-chip"><span class="n">${i+1}</span><span class="g">${g}</span></div>`).join('')||'<div class="muted">None yet.</div>'}</div></div></div></section>`;if(state.method==='player')document.getElementById('submit').onclick=submitPlayerRoll;else document.getElementById('auto').onclick=roll}
function counts(){return state.functional.reduce((a,g)=>(a[g]=(a[g]||0)+1,a),{})}
function selection(){const c=counts();const unique=Object.keys(c);app.innerHTML=`<section class="panel"><div class="stephead"><h2>Choose exactly three Glyphs</h2><span class="step">04 / 06</span></div><p class="instruction">All nine functional results are now recorded. Duplicate frequency affects initial daily uses, not eligibility. Choose any three. Unchosen results are relinquished.</p><div class="results">${unique.map(g=>`<div class="result ${state.selected.includes(g)?'selected':''}"><span class="count">×${c[g]}</span><h3>${g}</h3><small>${c[g]} appearance${c[g]===1?'':'s'} → ${c[g]} use${c[g]===1?'':'s'}/day per tier</small><button data-g="${g}">${state.selected.includes(g)?'Selected':'Choose Glyph'}</button></div>`).join('')}</div><div class="divider"></div><div class="notice">Selected: <strong>${state.selected.length}/3</strong>${state.voidMarks?` · Void Marks: <strong>${state.voidMarks}</strong>`:''}${state.witness.length?` · Witness results: <strong>${state.witness.length}</strong>`:''}</div><div class="actions"><button class="primary" id="finish" ${state.selected.length!==3?'disabled':''}>Initialize Character</button></div></section>`;document.querySelectorAll('[data-g]').forEach(b=>b.onclick=()=>{const g=b.dataset.g;if(state.selected.includes(g))state.selected=state.selected.filter(x=>x!==g);else if(state.selected.length<3)state.selected.push(g);save();render()});document.getElementById('finish').onclick=finish}
function finish(){const c=counts();state.character={hp:10,maxHp:10,glyphs:state.selected.map(g=>({name:g,frequency:c[g],currentTier:1,tiers:Array.from({length:5},(_,i)=>({tier:i+1,mastery:0,dailyUses:c[g],remainingUses:i===0?c[g]:0,permanentBonus:0,unlocked:i===0}))})),voidMarks:state.voidMarks,voidTiers:[],witness:[...state.witness],functional:[...state.functional],frequency:c,conditions:[],equipment:[],concentration:null,questState:null,reputation:{},relationships:{}};state.phase='complete';save();render()}
function complete(){app.innerHTML=`<section class="panel"><div class="stephead"><h2>Character Initialized</h2><span class="step">05 / 06</span></div><div class="notice success">The three Glyphs are established. Each begins at Tier I, 0% mastery, with its full frequency-based daily-use allotment.</div><div class="summary" style="margin-top:18px"><div><div class="muted" style="margin-bottom:10px">Chosen Glyphs</div>${state.character.glyphs.map(g=>glyphCard(g)).join('')}</div><aside><div class="statbox"><div class="stat"><span class="muted">HP</span><strong>10 / 10</strong></div><div class="stat"><span class="muted">Void Marks</span><strong>${state.character.voidMarks}</strong></div><div class="stat"><span class="muted">Witness results</span><strong>${state.character.witness.length}</strong></div><div class="stat"><span class="muted">Functional results</span><strong>9</strong></div></div></aside></div><div class="divider"></div><div class="notice">Character creation is complete. The Canon defines the next campaign phase as <strong>Awakening / Introduction</strong>. The current Canon does not provide a specific awakening scene, so this prototype will not invent one.</div><div class="actions"><button class="secondary" id="export">Export Campaign JSON</button><button class="primary" id="awaken">Continue to Void Marks</button></div></section>`;document.getElementById('awaken').onclick=()=>{state.phase='void-purchase';save();render()};document.getElementById('export').onclick=exportCharacter}
function voidPurchase(){
 const owned=purchasedVoidTiers();
 const marks=Number(state.character?.voidMarks)||0;
 app.innerHTML=`<section class="panel"><div class="stephead"><h2>Void Mark Purchases</h2><span class="step">OPTIONAL</span></div>
 <p class="instruction">Spend earned Void Marks to purchase permanent Void abilities. Purchased abilities do not consume Void Marks when used. You may continue without spending any Marks.</p>
 <div class="notice">Available Void Marks: <strong>${marks}</strong> · Purchased: <strong>${purchasedVoidNames().map(esc).join(', ')||'None'}</strong></div>
 <div class="results">${VOID_TIERS.map(v=>{const e=voidPurchaseEligibility(v);const isOwned=owned.includes(v.tier);return `<div class="result ${isOwned?'selected':''}"><span class="count">${v.cost} Marks</span><h3>${esc(v.name)} · Tier ${roman(v.tier)}</h3><small>${esc(v.description)}${v.requires.length?` · Requires ${v.requires.map(t=>esc(VOID_TIERS.find(x=>x.tier===t).name)).join(', ')}`:''}</small><button data-void-tier="${v.tier}" ${e.ok?'':'disabled'}>${isOwned?'Purchased':e.ok?'Purchase':esc(e.reason)}</button></div>`}).join('')}</div>
 <div class="divider"></div><div class="actions"><button class="primary" id="continueAwakening">Continue to Awakening</button></div></section>`;
 document.querySelectorAll('[data-void-tier]').forEach(b=>b.onclick=()=>buyVoidTier(Number(b.dataset.voidTier)));
 document.getElementById('continueAwakening').onclick=()=>{state.phase='awakening';save();render()};
}
function gateEnding(){app.innerHTML=`<section class="panel"><div class="stephead"><h2>Initiate Gate</h2></div><div class="notice success">Tier V — Initiate Gate has been purchased. This journey has ended.</div><p class="instruction">Export your campaign to preserve the final character state.</p><div class="actions"><button class="primary" id="exportGate">Export Campaign JSON</button></div></section>`;document.getElementById('exportGate').onclick=exportCharacter;}
function glyphCard(g){const t=g.tiers[g.currentTier-1];return `<article class="glyph-card"><h3>${esc(g.name)} ${roman(g.currentTier)}</h3><div class="glyph-meta">${g.frequency} appearance${g.frequency===1?'':'s'} · ${t.remainingUses}/${t.dailyUses} uses · ${t.mastery}% mastery</div><div class="bar"><i style="width:${t.mastery}%"></i></div></article>`}
function awakening(){app.innerHTML=`<section class="panel"><div class="stephead"><h2>Awakening / Introduction</h2><span class="step">06 / 06</span></div><div class="awakening"><div class="eyebrow">CANON BOUNDARY</div><h3>Your character has awakened to the fact of manifestation.</h3><p>The Canon establishes Awakening / Introduction as a campaign phase, but does not prescribe a fixed awakening scene or opening event.</p><div class="notice">No invented lore, NPC, threat, quest, Expression, or consequence has been added here. The next layer is the DM/Game Engine action loop.</div><div class="character-strip">${state.character.glyphs.map(g=>`<span>${esc(g.name)} ${roman(g.currentTier)} · ${g.tiers[g.currentTier-1].remainingUses}/${g.tiers[g.currentTier-1].dailyUses}</span>`).join('')}</div><div class="actions"><button class="primary" id="enter">Enter Campaign Play</button></div></div></section>`;document.getElementById('enter').onclick=()=>{state.phase='play';save();render()}}

function currentTier(g){return g.tiers[g.currentTier-1]}
function findExpression(text){
 const q=text.toLowerCase();
 const candidates=[];
 state.character.glyphs.forEach(g=>{
  g.tiers.filter(t=>t.unlocked).forEach(t=>{const e=EXPRESSIONS[String(g.name).toUpperCase()]?.[String(t.tier)];if(!e)return;const needles=[e.name,g.name+' '+e.name];if(needles.some(n=>q.includes(n.toLowerCase())))candidates.push({glyph:g,tier:t,expression:e})});
 });
 return candidates.sort((a,b)=>b.expression.name.length-a.expression.name.length)[0]||null;
}
function inferIntent(text,mode){
 const q=text.toLowerCase();
 if(mode==='consideration'||/\b(consider|maybe|thinking about|what if|could i|should i)\b/.test(q))return 'consideration';
 if(mode==='conditional'||/\b(if|when|once|after|until)\b.*\b(i will|i’ll|i'm going to|i am going to)\b/.test(q))return 'conditional';
 return 'committed';
}
function identifyMethod(text,expr){
 if(expr)return 'Glyph Expression';
 const q=text.toLowerCase();
 if(/\b(talk|ask|tell|persuade|threaten|negotiate|convince|question|lie)\b/.test(q))return 'Social approach';
 if(/\b(use|equip|draw|drink|read|open|unlock|carry)\b/.test(q)&&state.character.equipment.length)return 'Equipment';
 if(/\b(climb|jump|run|walk|hide|search|examine|inspect|break|push|pull|move|swim|fight|strike|grab|look)\b/.test(q))return 'Mundane / environmental action';
 return 'Other established method';
}
function validateAction(intent,method,expr){
 const issues=[];
 if(intent==='consideration')return {valid:true,issues,commit:false};
 if(method==='Glyph Expression'){
  if(!expr)return {valid:false,issues:['No established Expression matched the declaration.'],commit:false};
  if(!expr.tier.unlocked)return {valid:false,issues:[`${expr.glyph.name} ${roman(expr.tier.tier)} is not unlocked.`],commit:false};
  if(expr.tier.remainingUses<=0)return {valid:false,issues:[`${expr.glyph.name} ${roman(expr.tier.tier)} has no remaining uses.`],commit:false};
 }
 return {valid:true,issues,commit:intent==='committed'};
}
function applyExpressionCost(expr){expr.tier.remainingUses=Math.max(0,expr.tier.remainingUses-1)}
function applyMasteryDecision(decision, result){
 const feedback=[];
 if(!decision || decision.status==='not_applicable')return {applied:null,feedback};
 if(decision.status==='error'){
  feedback.push('Mastery adjudication could not be completed. No mastery was silently awarded or lost.');
  result.steps.mastery='error';
  return {applied:null,feedback};
 }
 if(!result.expression || !decision.eligible || !Number.isInteger(Number(decision.amount)) || Number(decision.amount)<=0){
  if(result.expression)feedback.push('No mastery awarded for this use; the adjudicator found it was not sufficiently meaningful for progression.');
  return {applied:null,feedback};
 }
 const amount=Number(decision.amount);
 const glyphName=result.expression.glyph;
 const tierNum=result.expression.tier;
 const g=state.character.glyphs.find(x=>x.name.toLowerCase()===glyphName.toLowerCase());
 if(!g)return {applied:null,feedback};
 const update=PolyhedronRules.applyMasteryAward(state.character,glyphName,tierNum,amount);
 feedback.push(...update.feedback);
 if(update.error || update.appliedTotal<=0)return {applied:null,feedback};
 const entry={time:result.time,glyph:g.name,tier:tierNum,expression:result.expression.name,amount:update.appliedTotal,reason:decision.reason||'',progression:update.progression};
 state.masteryHistory.push(entry);
 result.masteryEvent=entry;
 feedback.unshift(`${g.name} ${roman(tierNum)} — Mastery +${update.appliedTotal}%. ${decision.reason||''}`.trim());
 return {applied:entry,feedback};
}
function expressionFromUse(use){
 if(!use)return null;
 const g=state.character.glyphs.find(x=>x.name.toLowerCase()===String(use.glyph||'').toLowerCase());
 if(!g)return null;
 const tierNum=Number(use.tier);
 const t=g.tiers[tierNum-1];
 const e=EXPRESSIONS[String(g.name).toUpperCase()]?.[String(tierNum)];
 if(!t || !t.unlocked || !e || e.name.toLowerCase()!==String(use.name||'').toLowerCase())return null;
 return {glyph:g,tier:t,expression:e};
}

async function processAction(text,mode){
 const intent=inferIntent(text,mode);
 const result={time:new Date().toLocaleTimeString(),text,intent,method:'pending',expression:null,validation:{valid:true,issues:[],commit:intent==='committed'},steps:{interpretIntent:'complete',identifyMethod:'pending',validateAgainstCanon:'pending',resolve:'pending',applyCosts:'not triggered',mastery:'not triggered',rewards:'not triggered',continueWorld:'pending'},status:'pending'};
 if(intent==='consideration'){
  result.steps.identifyMethod='not applicable';result.steps.validateAgainstCanon='not applicable';result.steps.resolve='not applicable';
  result.outcome='Consideration recorded. No action has occurred and no resource was spent.';
  result.status='complete';state.actionHistory.push(result);state.actions.push({text,time:result.time,intent,method:'Consideration'});state.lastEngineResult=result;save();render();return;
 }
 if(intent==='conditional'){
  result.steps.identifyMethod='pending trigger';result.steps.validateAgainstCanon='pending trigger';result.steps.resolve='pending trigger';
  result.outcome='Conditional intent recorded. No action has occurred and no resource was spent.';
  result.status='complete';state.pendingActions.push({id:Date.now(),text,method:'pending',expression:null,created:result.time,status:'pending'});state.actionHistory.push(result);state.actions.push({text,time:result.time,intent,method:'Conditional intent'});state.lastEngineResult=result;save();render();return;
 }
 state.actionHistory.push(result);state.actions.push({text,time:result.time,intent,method:'pending'});state.lastEngineResult=result;save();render();
 try{
  const response=await apiFetch('/api/turn',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:text,engine:{intent},state:{character:state.character,phase:state.phase,campaignContext:state.campaignContext,recollections:state.recollections.slice(-30),activeEffects:state.activeEffects,pendingActions:state.pendingActions,actionHistory:state.actionHistory.slice(-8),expressionHistory:state.expressionHistory.slice(-20),masteryHistory:state.masteryHistory.slice(-20)}})});
  const data=await response.json(); if(!response.ok)throw new Error(data.error||'DM service unavailable.');

  const expr=expressionFromUse(data.expressionUse);
  result.method=typeof data.method==='string'?data.method:(expr?'Glyph Expression':'Other established method');
  result.expression=expr?{glyph:expr.glyph.name,tier:expr.tier.tier,name:expr.expression.name}:null;
  const serverRejectedExpression=data.expressionValidation?.valid===false;
  result.validation={valid:!serverRejectedExpression && (!data.expressionUse || !!expr),issues:serverRejectedExpression?[data.expressionValidation.reason||'The engine rejected the Expression.']:data.expressionUse&&!expr?['The DM returned an Expression that does not match the active Canon registry. No supernatural use was recorded.']:[],commit:true};
  result.steps.identifyMethod='complete';
  result.steps.validateAgainstCanon=result.validation.valid?'pass':'fail';

  if(expr && result.validation.valid){
   if(expr.tier.remainingUses<=0){
    result.validation={valid:false,issues:[`${expr.glyph.name} ${roman(expr.tier.tier)} has no remaining uses.`],commit:false};
    result.expression=null;
    result.steps.validateAgainstCanon='fail';
    result.steps.applyCosts='not triggered';
    result.outcome='The Expression is canonical, but no daily use remains, so it was not activated.';
   }else{
    applyExpressionCost(expr);result.steps.applyCosts='Expression daily use consumed';
    state.activeEffects.push({id:Date.now(),glyph:expr.glyph.name,tier:expr.tier.tier,expression:expr.expression.name,description:expr.expression.description,started:result.time});
    result.outcome=data.narrative||'The DM returned no narrative response.';
   }
  }else{
   result.outcome=data.narrative||'The DM returned no narrative response.';
  }

  result.dmResponse=result.outcome;result.status='complete';result.steps.resolve='DM adjudication complete';result.steps.continueWorld='complete';
  if(expr && result.validation.valid){
   const expressionEvent={time:result.time,glyph:expr.glyph.name,tier:expr.tier.tier,name:expr.expression.name,description:expr.expression.description,action:text,outcome:result.outcome};
   state.expressionHistory.push(expressionEvent);
   result.expressionEvent=expressionEvent;
  }
  const mastery=applyMasteryDecision(data.masteryDecision,result);
  result.masteryEvent=mastery.applied;result.masteryFeedback=mastery.feedback;
  if(result.steps.mastery!=='error')result.steps.mastery=mastery.applied?'applied':(expr?'none':'not applicable');
  if(Array.isArray(data.recollections))state.recollections.push(...data.recollections.map(x=>({text:x,time:result.time})));
  if(Array.isArray(data.establishedFacts)) for(const fact of data.establishedFacts) if(typeof fact==='string' && fact.trim() && !state.campaignContext.establishedFacts.includes(fact.trim())) state.campaignContext.establishedFacts.push(fact.trim());
  if(Array.isArray(data.unresolvedThreads))state.campaignContext.unresolvedThreads=data.unresolvedThreads.filter(x=>typeof x==='string'&&x.trim()).map(x=>x.trim());
  if(typeof data.currentSituation==='string'&&data.currentSituation.trim())state.campaignContext.currentSituation=data.currentSituation.trim();
  result.contextUpdate={establishedFacts:data.establishedFacts||[],unresolvedThreads:data.unresolvedThreads||[],currentSituation:data.currentSituation||''};
  result.authoritativeExpressionState=state.character.glyphs.map(g=>({glyph:g.name,currentTier:g.currentTier,tiers:g.tiers.map(t=>({tier:t.tier,unlocked:t.unlocked,mastery:t.mastery,dailyUses:t.dailyUses,remainingUses:t.remainingUses}))}));
  state.lastEngineResult=result;save();render();
 }catch(err){result.status='error';result.outcome=`The DM could not respond: ${err.message}`;result.steps.resolve='DM unavailable';state.lastEngineResult=result;save();render();}
}
function actionPanel(){return ''}
function play(){
 const history=state.actionHistory||[];
 const last=history[history.length-1];
 const glyphs=state.character.glyphs.map(g=>{
   const tiers=g.tiers.filter(t=>t.unlocked).sort((a,b)=>a.tier-b.tier);
   return `<div class="sheet-glyph"><strong class="sheet-glyph-name">${esc(g.name)}</strong>${tiers.map(t=>`<div class="sheet-tier ${t.tier===g.currentTier?'current':''}"><div class="sheet-tier-line"><strong>${esc(g.name)} ${roman(t.tier)}${t.tier===g.currentTier?' · CURRENT':''}</strong><span>${t.mastery}% mastery</span></div><div class="uses">${t.remainingUses}/${t.dailyUses} uses</div><div class="bar"><i style="width:${Math.max(0,Math.min(100,Number(t.mastery)||0))}%"></i></div></div>`).join('')}</div>`;
 }).join('');
 const transcript=history.length?history.slice(-8).map(r=>`<div class="turn"><div class="turn-label">YOU</div><p>${esc(r.text)}</p>${r.dmResponse?`<div class="dm-response"><div class="turn-label">DM</div><p>${esc(r.dmResponse)}</p></div>`:r.outcome?`<div class="turn-result">${esc(r.outcome)}</div>`:''}${r.masteryFeedback?.length?`<div class="turn-result"><strong>Mastery</strong><br>${r.masteryFeedback.map(x=>esc(x)).join('<br>')}</div>`:''}</div>`).join(''):`<div class="empty-scene"><div class="eyebrow">CAMPAIGN READY</div><h3>The story begins with your next decision.</h3><p>Your character is manifested. The world will respond to what you choose to do.</p><p class="muted">Describe what your character says, does, investigates, attempts, or uses. A good suggestion to start would be to have a look around.</p></div>`;
 app.innerHTML=`<section class="campaign"><div class="campaign-main"><div class="campaign-header"><div><div class="eyebrow">CAMPAIGN</div><h2>What do you do?</h2></div><span class="live-dot">● LIVE</span></div><div class="story">${transcript}</div><div class="action-box"><label for="action">Your action</label><textarea id="action" rows="3" placeholder="Describe what your character does..." autofocus></textarea><div class="action-footer"><span class="muted">Describe what your character does. The DM will respond to the situation.</span><button class="primary" id="declare">Act</button></div></div></div><aside class="character-sheet"><div class="sheet-title"><div class="eyebrow">CHARACTER</div><h3>Your Character</h3></div><div class="sheet-stat"><span>HP</span><strong>${state.character.hp} / ${state.character.maxHp}</strong></div><div class="sheet-stat"><span>Void Marks</span><strong>${state.character.voidMarks}</strong></div><div class="sheet-divider"></div><div class="muted sheet-heading">VOID ABILITIES</div>${purchasedVoidNames().map(n=>`<div class="sheet-stat"><strong>${esc(n)}</strong></div>`).join('')||'<div class="muted small">None purchased</div>'}<div class="sheet-divider"></div><div class="muted sheet-heading">GLYPHS</div>${glyphs}</aside></div>`;
 document.getElementById('declare').onclick=()=>{const text=document.getElementById('action').value.trim();if(text)processAction(text,'committed')};
 document.getElementById('action').addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){document.getElementById('declare').click()}});
}
function exportCharacter(){
 const exportState=JSON.parse(JSON.stringify(state));
 exportState.exportedAt=new Date().toISOString();
 const blob=new Blob([JSON.stringify(exportState,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob);
 const a=document.createElement('a');
 a.href=url;
 a.download='polyhedron-campaign.json';
 document.body.appendChild(a);
 a.click();
 a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),0);
}
function importCharacter(file){
 const reader=new FileReader();
 reader.onload=()=>{
  try{
   const imported=JSON.parse(reader.result);
   if(!imported || typeof imported!=='object' || !imported.phase)throw new Error('This file does not contain a valid Polyhedron campaign.');
   state={...defaultState(),...imported};
   migrateCharacter();
   save();
   render();
  }catch(err){
   alert(`Import failed: ${err.message}`);
  }
 };
 reader.onerror=()=>alert('Import failed: the campaign file could not be read.');
 reader.readAsText(file);
}
document.getElementById('changeModelBtn').onclick=async()=>{modelReady=false;try{await apiFetch('/api/llm/clear',{method:'POST'});}catch{}scanModels();};
document.getElementById('resetBtn').onclick=()=>{
 if(confirm('Start a new campaign? The current campaign will remain available only if you have exported it.')){
  state=defaultState();
  save();
  render();
 }
};
document.getElementById('exportBtn').onclick=exportCharacter;
document.getElementById('importBtn').onclick=()=>document.getElementById('importFile').click();
document.getElementById('importFile').addEventListener('change',e=>{
 const file=e.target.files?.[0];
 if(file)importCharacter(file);
 e.target.value='';
});
scanModels();
