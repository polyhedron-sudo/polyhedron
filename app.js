const GLYPHS={1:'Witness',2:'Crown',3:'Veil',4:'Maw',5:'Lance',6:'Mirror',7:'Chain',8:'Morph',9:'Catalyst',10:'Ember',11:'Tides',12:'Stone',13:'Gale',14:'Bloom',15:'Shade',16:'Halo',17:'Ash',18:'Void',19:'Pulse',20:'Witness'};
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
const defaultState=()=>({phase:'opening',method:null,rolls:[],functional:[],witness:[],voidMarks:0,selected:[],character:null,lastSave:null,actions:[],pendingActions:[],actionHistory:[],recollections:[],activeEffects:[],lastEngineResult:null});
let state=JSON.parse(localStorage.getItem('polyhedron-phase1')||'null')||defaultState();
const app=document.getElementById('app');
function save(){state.lastSave=new Date().toLocaleTimeString();localStorage.setItem('polyhedron-phase1',JSON.stringify(state));const el=document.getElementById('saveStatus');if(el)el.textContent='Saved '+state.lastSave}
function esc(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function roman(n){return ['0','I','II','III','IV','V'][n]}
function migrateCharacter(){
 if(!state.character)return;
 state.character.glyphs=state.character.glyphs.map(g=>{
  if(g.tiers)return g;
  const tiers=Array.from({length:5},(_,i)=>({tier:i+1,mastery:i===0?(g.mastery||0):0,dailyUses:g.frequency+(i===0&&g.tier===1?0:0),remainingUses:i===0?(g.remainingUses??g.dailyUses):0,permanentBonus:0,unlocked:i===0}));
  return {...g,tiers,currentTier:g.tier||1};
 });
 state.pendingActions ||= []; state.actionHistory ||= []; state.recollections ||= []; state.activeEffects ||= []; state.lastEngineResult ||= null;
}
migrateCharacter();
function render(){
 if(state.phase==='opening')return opening();
 if(state.phase==='method')return method();
 if(state.phase==='rolling')return rolling();
 if(state.phase==='selection')return selection();
 if(state.phase==='complete')return complete();
 if(state.phase==='awakening')return awakening();
 if(state.phase==='play')return play();
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
function finish(){const c=counts();state.character={hp:10,maxHp:10,glyphs:state.selected.map(g=>({name:g,frequency:c[g],currentTier:1,tiers:Array.from({length:5},(_,i)=>({tier:i+1,mastery:0,dailyUses:c[g],remainingUses:i===0?c[g]:0,permanentBonus:0,unlocked:i===0}))})),voidMarks:state.voidMarks,witness:[...state.witness],functional:[...state.functional],frequency:c,conditions:[],equipment:[],concentration:null,questState:null,reputation:{},relationships:{}};state.phase='complete';save();render()}
function complete(){app.innerHTML=`<section class="panel"><div class="stephead"><h2>Character Initialized</h2><span class="step">05 / 06</span></div><div class="notice success">The three Glyphs are established. Each begins at Tier I, 0% mastery, with its full frequency-based daily-use allotment.</div><div class="summary" style="margin-top:18px"><div><div class="muted" style="margin-bottom:10px">Chosen Glyphs</div>${state.character.glyphs.map(g=>glyphCard(g)).join('')}</div><aside><div class="statbox"><div class="stat"><span class="muted">HP</span><strong>10 / 10</strong></div><div class="stat"><span class="muted">Void Marks</span><strong>${state.character.voidMarks}</strong></div><div class="stat"><span class="muted">Witness results</span><strong>${state.character.witness.length}</strong></div><div class="stat"><span class="muted">Functional results</span><strong>9</strong></div></div></aside></div><div class="divider"></div><div class="notice">Character creation is complete. The Canon defines the next campaign phase as <strong>Awakening / Introduction</strong>. The current Canon does not provide a specific awakening scene, so this prototype will not invent one.</div><div class="actions"><button class="secondary" id="export">Export Campaign JSON</button><button class="primary" id="awaken">Begin Awakening</button></div></section>`;document.getElementById('awaken').onclick=()=>{state.phase='awakening';save();render()};document.getElementById('export').onclick=exportCharacter}
function glyphCard(g){const t=g.tiers[g.currentTier-1];return `<article class="glyph-card"><h3>${esc(g.name)} ${roman(g.currentTier)}</h3><div class="glyph-meta">${g.frequency} appearance${g.frequency===1?'':'s'} · ${t.remainingUses}/${t.dailyUses} uses · ${t.mastery}% mastery</div><div class="bar"><i style="width:${t.mastery}%"></i></div></article>`}
function awakening(){app.innerHTML=`<section class="panel"><div class="stephead"><h2>Awakening / Introduction</h2><span class="step">06 / 06</span></div><div class="awakening"><div class="eyebrow">CANON BOUNDARY</div><h3>Your character has awakened to the fact of manifestation.</h3><p>The Canon establishes Awakening / Introduction as a campaign phase, but does not prescribe a fixed awakening scene or opening event.</p><div class="notice">No invented lore, NPC, threat, quest, Expression, or consequence has been added here. The next layer is the DM/Game Engine action loop.</div><div class="character-strip">${state.character.glyphs.map(g=>`<span>${esc(g.name)} ${roman(g.currentTier)} · ${g.tiers[g.currentTier-1].remainingUses}/${g.tiers[g.currentTier-1].dailyUses}</span>`).join('')}</div><div class="actions"><button class="primary" id="enter">Enter Campaign Play</button></div></div></section>`;document.getElementById('enter').onclick=()=>{state.phase='play';save();render()}}

function currentTier(g){return g.tiers[g.currentTier-1]}
function findExpression(text){
 const q=text.toLowerCase();
 const candidates=[];
 state.character.glyphs.forEach(g=>{
  g.tiers.filter(t=>t.unlocked).forEach(t=>{const e=EXPRESSIONS[g.name]?.[String(t.tier)];if(!e)return;const needles=[e.name,g.name+' '+e.name];if(needles.some(n=>q.includes(n.toLowerCase())))candidates.push({glyph:g,tier:t,expression:e})});
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
function processAction(text,mode){
 const intent=inferIntent(text,mode); const expr=findExpression(text); const method=identifyMethod(text,expr); const validation=validateAction(intent,method,expr);
 const result={time:new Date().toLocaleTimeString(),text,intent,method,expression:expr?{glyph:expr.glyph.name,tier:expr.tier.tier,name:expr.expression.name}:null,validation,steps:{interpretIntent:'complete',identifyMethod:'complete',validateAgainstCanon:validation.valid?'pass':'fail',resolve:'pending',applyCosts:'not triggered',mastery:'not triggered',rewards:'not triggered',continueWorld:'pending'}};
 if(intent==='conditional'&&validation.valid){state.pendingActions.push({id:Date.now(),text,method,expression:result.expression,created:result.time,status:'pending'});result.steps.resolve='pending trigger';result.outcome='Conditional intent recorded. No action has occurred and no resource was spent.';}
 else if(intent==='consideration'){result.steps.resolve='not applicable';result.outcome='Consideration recorded. No action has occurred and no resource was spent.';}
 else if(!validation.valid){result.steps.resolve='blocked';result.outcome='Action not committed because Canon validation failed.';}
 else if(method==='Glyph Expression'){
  applyExpressionCost(expr); result.steps.applyCosts='Expression daily use consumed';result.steps.resolve='activation established; narrative outcome requires campaign context';result.outcome=`${expr.glyph.name} ${roman(expr.tier.tier)} — ${expr.expression.name} is committed and its daily use has been consumed. The specific narrative outcome remains subject to circumstances.`;
  state.activeEffects.push({id:Date.now(),glyph:expr.glyph.name,tier:expr.tier.tier,expression:expr.expression.name,description:expr.expression.description,started:result.time});
 } else {result.steps.resolve='narrative adjudication required';result.outcome='Committed action recorded. Its success, failure, partial success, complication, or consequence requires the campaign situation to adjudicate.';}
 state.actionHistory.push(result);state.actions.push({text,time:result.time,intent,method});state.lastEngineResult=result;save();render();}
function actionPanel(){const r=state.lastEngineResult;return r?`<div class="engine-result"><div class="eyebrow">ENGINE RESULT</div><h3>${esc(r.outcome)}</h3><div class="pipeline">${[['1','Interpret Intent',r.steps.interpretIntent],['2','Identify Method',r.steps.identifyMethod],['3','Validate Canon',r.steps.validateAgainstCanon],['4','Resolve',r.steps.resolve],['5','Apply Costs',r.steps.applyCosts],['6','Mastery',r.steps.mastery],['7','Rewards',r.steps.rewards],['8','Continue World',r.steps.continueWorld]].map(x=>`<div class="pipeline-row"><span>${x[0]}</span><strong>${x[1]}</strong><em>${esc(x[2])}</em></div>`).join('')}</div></div>`:''}
function play(){const last=state.actions[state.actions.length-1];app.innerHTML=`<section class="panel"><div class="stephead"><h2>Campaign Play — DM / Game Engine</h2><span class="step">ACTIVE</span></div><div class="play-grid"><div><div class="scene"><div class="eyebrow">PLAYER AGENCY</div><h3>Declare what your character attempts.</h3><p>The engine now separates consideration, conditional intent, and committed action. It identifies a method, validates established abilities and resources, and records the result without inventing missing Canon.</p><p class="muted">Narrative success/failure still depends on the actual campaign situation. This local slice provides the rules pipeline and state accounting; an AI DM layer can be attached to the adjudication stage next.</p></div><div class="action-box"><label for="action">Your declaration</label><textarea id="action" rows="4" placeholder="Example: I use Ember Heat on the torch.\n\nOr: I consider using Ember Heat.\n\nOr: If the guard approaches, I will use Ember Heat."></textarea><div class="mode-row"><button class="mode active" data-mode="committed">Committed action</button><button class="mode" data-mode="conditional">Conditional intent</button><button class="mode" data-mode="consideration">Consideration</button></div><button class="primary" id="declare">Run Through Engine</button></div>${actionPanel()}</div><aside><div class="statbox"><div class="muted" style="margin-bottom:8px">Character State</div><div class="stat"><span>HP</span><strong>${state.character.hp} / ${state.character.maxHp}</strong></div><div class="stat"><span>Void Marks</span><strong>${state.character.voidMarks}</strong></div>${state.character.glyphs.map(g=>{const t=currentTier(g);return `<div class="stat"><span>${esc(g.name)} ${roman(g.currentTier)}</span><strong>${t.remainingUses}/${t.dailyUses}</strong></div>`}).join('')}</div>${state.pendingActions.length?`<div class="notice" style="margin-top:12px"><strong>Pending conditional actions</strong>${state.pendingActions.map(p=>`<div class="pending"><span>${esc(p.text)}</span><small>${esc(p.expression?`${p.expression.glyph} ${roman(p.expression.tier)} — ${p.expression.name}`:p.method)}</small></div>`).join('')}</div>`:''}${last?`<div class="notice" style="margin-top:12px"><strong>Last declaration</strong><br>${esc(last.text)}<br><span class="muted">${esc(last.intent)} · ${esc(last.method)} · ${esc(last.time)}</span></div>`:''}<div class="notice" style="margin-top:12px"><strong>Resource boundary</strong><br>Expression uses are spent only when the character actually commits the activation. Consideration and conditional intent do not spend a use.</div></aside></div></section>`;let mode='committed';document.querySelectorAll('.mode').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;document.querySelectorAll('.mode').forEach(x=>x.classList.toggle('active',x===b))});document.getElementById('declare').onclick=()=>{const text=document.getElementById('action').value.trim();if(text)processAction(text,mode)}}
function exportCharacter(){const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='polyhedron-campaign.json';a.click();URL.revokeObjectURL(a.href)}
document.getElementById('resetBtn').onclick=()=>{if(confirm('Start a new campaign and discard this local prototype state?')){state=defaultState();save();render()}};
render();
