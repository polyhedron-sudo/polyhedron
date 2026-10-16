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

  root.PolyhedronRules = { applyMasteryAward };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.PolyhedronRules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
