<!-- What changes for whom, and why. Link the issue it closes. -->

## Checklist (CONTRIBUTING.md, "Definition of done")

- [ ] Tests came first for parsers, models and use cases, named as sentences.
- [ ] `pnpm verify` is green.
- [ ] Constants are named and their sources cited; no lint rule disabled without a reason.
- [ ] New terms are in `docs/GLOSSARY.md`; a non-obvious decision has an ADR.
- [ ] The public API of the npm package (`apps/library/src/index.ts`) changed only on purpose,
      with `apps/library/CHANGELOG.md` saying so.
