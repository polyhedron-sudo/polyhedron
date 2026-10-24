'use strict';
(function (root) {
  function roman(n) { return ['0','I','II','III','IV','V'][n] || String(n); }

  // Deterministic mastery/tier update. This function never asks the LLM to mutate state.
  function applyMasteryAward(character, glyphName, tierNumber, amount) {
    const glyph = character?.glyphs?.find(g => String(g.name).toLowerCase() === String(glyphName).toLowerCase());
    if (!glyph) return { appliedTotal:0, progression:[], feedback:[], error:'Glyph not found.' };
    if (!Number.isInteger(Number(tierNumber)) || tierNumber < 1 || tierNumber > 5) return { appliedTotal:0, progression:[], feedback:[], error:'Invalid tier.' };
    const target = glyph.tiers?.[Number(tierNumber)-1];
    if (!target || !target.unlocked) return { appliedTotal:0, progression:[], feedback:[], error:'Tier is not unlocked.' };
    let remaining = Math.max(0, Number(amount) || 0);
    let index = Number(tierNumber)-1;
    const progression = [];
    const feedback = [];
    while (remaining > 0 && index < glyph.tiers.length) {
      const tier = glyph.tiers[index];
      if (!tier.unlocked || Number(tier.mastery) >= 100) break;
      const before = Number(tier.mastery) || 0;
      const applied = Math.min(remaining, 100-before);
      if (applied <= 0) break;
      tier.mastery = before + applied;
      remaining -= applied;
      progression.push({ tier:tier.tier, before, after:tier.mastery, applied });
      if (tier.mastery < 100) break;

      // The transition happens only on the first arrival at 100%, never on later uses.
      tier.permanentBonus = (Number(tier.permanentBonus) || 0) + 1;
      tier.dailyUses = (Number(tier.dailyUses) || 0) + 1;
      feedback.push(`${glyph.name} ${roman(tier.tier)} — Mastery complete. Permanent daily uses increase to ${tier.dailyUses}.`);
      if (index < glyph.tiers.length-1) {
        const next = glyph.tiers[index+1];
        next.unlocked = true;
        next.mastery = Number(next.mastery) || 0;
        next.permanentBonus = Number(next.permanentBonus) || 0;
        next.dailyUses = Number(glyph.frequency) + next.permanentBonus;
        next.remainingUses = next.dailyUses;
        glyph.currentTier = next.tier;
        feedback.push(`${glyph.name} ${roman(next.tier)} unlocked with ${next.dailyUses}/${next.dailyUses} uses available.`);
        index++;
      } else {
        // Tier V is the final normal tier; Canon defines no Tier VI.
        remaining = 0;
      }
    }
    return { appliedTotal:progression.reduce((sum, p) => sum+p.applied, 0), progression, feedback, error:null };
  }

  const VOID_TIERS = [
    { tier:1, name:'Void Step', cost:2 },
    { tier:2, name:'Void Severance', cost:4, prerequisite:1 },
    { tier:3, name:'Temper Causality', cost:6, prerequisite:2 },
    { tier:4, name:'Touch the Void', cost:8 },
    { tier:5, name:'Initiate Gate', cost:10 }
  ];

  // Void Marks are a finite progression resource. Purchase decisions are enforced
  // by the engine, not by the LLM or by UI button state alone.
  function purchaseVoidTier(character, tierNumber) {
    const tier = VOID_TIERS.find(item => item.tier === Number(tierNumber));
    if (!character || typeof character !== 'object') return { ok:false, error:'Character is not initialized.' };
    character.voidTiers ||= [];
    const marks = Math.max(0, Number(character.voidMarks) || 0);
    if (!tier) return { ok:false, error:'Invalid Void tier.' };
    if (character.voidManifested) return { ok:false, error:'Void Manifestation has already ended this character’s journey.' };
    if (character.voidTiers.some(item => Number(item.tier) === tier.tier)) return { ok:false, error:`${tier.name} has already been purchased.` };
    if (tier.prerequisite && !character.voidTiers.some(item => Number(item.tier) === tier.prerequisite)) {
      const prerequisite = VOID_TIERS.find(item => item.tier === tier.prerequisite);
      return { ok:false, error:`${tier.name} requires ${prerequisite.name} first.` };
    }
    if (marks < tier.cost) return { ok:false, error:`${tier.name} costs ${tier.cost} Void Marks; only ${marks} available.` };
    character.voidMarks = marks - tier.cost;
    character.voidTiers.push({ tier:tier.tier, name:tier.name, cost:tier.cost, description:tier.description||'' });
    if (tier.tier === 5) character.voidManifested = true;
    return { ok:true, tier:{...tier}, remainingMarks:character.voidMarks, manifested:!!character.voidManifested };
  }

  root.PolyhedronRules = { applyMasteryAward, VOID_TIERS, purchaseVoidTier };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.PolyhedronRules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
