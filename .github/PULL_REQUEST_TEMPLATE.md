<!-- Thanks for the PR! Please keep the header below intact and tick the
     applicable boxes. Sections that don't apply can be removed. -->

## Summary

<!-- One paragraph. What does this change, and why? -->

## Type of change

- [ ] Bug fix
- [ ] New diagnostic check
- [ ] New transport (please use the New Transport issue template first)
- [ ] New provider integration
- [ ] Hardening module
- [ ] Documentation only
- [ ] Refactor / internal cleanup
- [ ] Other:

## Scope checklist (required)

- [ ] My change does not add server-side infrastructure that the project
      would have to operate.
- [ ] My change does not introduce closed-source production dependencies.
- [ ] My change does not run anything on the user's VPS without first
      showing them the exact command in the rendered bash one-liner.
- [ ] Secrets in any new logging paths go through `maskSecret()`.
- [ ] All values embedded in rendered shell scripts go through
      `escapeForBashC` or an explicit allowlist sanitizer.

## How I tested this

<!-- Concrete steps. Manual smoke tests are welcome — list them. -->

## Tests

- [ ] `npm test` passes locally.
- [ ] `npm run typecheck` passes locally.
- [ ] I added tests for any new pure functions or shell templating.

## Documentation

- [ ] `README.md` updated if the user-facing surface changed.
- [ ] `CHANGELOG.md` updated under `[Unreleased]`.
- [ ] `ARCHITECTURE.md` updated if the diagram or extension points changed.

## Related issues

<!-- e.g. "closes #42", "discussed in #17" -->
