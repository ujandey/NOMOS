# V2 requirements and verification

| PRD scope | Implementation | Verification |
| --- | --- | --- |
| §8, §21 geometric computation | `geometry.ts`, `instruments.ts`, calibrated SVG | Geometry unit/property tests, drag/keyboard browser tests and screenshots |
| FR-01, FR-11 evaluation | `scripts/evaluate.py`, versioned CSV/JSON evidence | Byte regeneration, independent operating-point calculations and manifest validation |
| FR-02–FR-08 exploration | Envelope solver, mission controls, operating-point selector, evidence drawer | Solver unit/property tests, seeded invariants and browser workflow |
| FR-09 compiler | Strict mission patch, offline grammar, optional server adapter | Grammar tests, invalid provider reply test, preview/apply and invalid mission browser tests |
| FR-10 export | JSON and YAML decision record with hashes and aligned geometry | Property round-trips and browser-parsed downloads |
| FR-12–FR-14 release | Offline bundle, responsive UI, keyboard and pointer controls | `npm run check`, Chromium at desktop and mobile sizes |
| FR-16, FR-17, FR-19 optional | Evidence comparison, ranked evaluated alternatives, preset controls | Deterministic dominance, margins and tightened-mission browser coverage |
