# Polyhedron — Phase 1B / DM-Engine Slice

Dependency-free browser prototype for the Polyhedron Canon.

## Run

Extract the ZIP and open `index.html` in a modern browser. No server or build step is required.

## Included

- Mandatory Campaign Opening
- Player Rolls / LLM Rolls character creation
- Witness and Void handling
- Nine functional results and duplicate frequency
- Three-Glyph selection
- Character initialization
- Five-tier Expression data extracted from the supplied Canon
- Awakening / Introduction boundary without invented lore
- DM/Game Engine action pipeline
- Consideration / Conditional Intent / Committed Action distinction
- Method identification
- Expression validation against unlocked tier and remaining uses
- Correct resource accounting: no spend for consideration or conditional intent
- Conditional action persistence
- Active Expression activation records
- Engine pipeline visibility for prototype testing
- Persistent localStorage state
- Campaign JSON export

## Engine boundary

This slice intentionally does **not** invent scene facts, NPCs, quest outcomes, or Expression results that require campaign context. A committed mundane action or Expression activation is recorded and validated, while narrative success/failure/partial success/complication remains the next integration point for the AI DM layer.

The source Canon is the authority. The browser rules layer does not grant abilities, remove limitations, or create resources that are not established in Canon.
