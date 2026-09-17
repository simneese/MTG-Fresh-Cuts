# Regression-test policy

Every correction to card-language extraction, relationship inference, engine scoring, role assignment, or the synergy UI must include a regression test in the same change.

- General language rules belong in `effect-extractors.test.ts` or `negative-extraction.test.ts`.
- Relationship implications belong in `relationship-graph.test.ts`.
- Previously reported named cards belong in `named-regressions.test.ts`.
- Scoring changes must update an intentional representative-deck snapshot.
- UI behavior belongs under `tests/ui`.
- Performance-sensitive changes must keep the 100-, 200-, and 500-card budgets passing.

Card names are fixtures, never production exceptions. Fixes must be expressed as reusable Oracle-text or graph rules.
