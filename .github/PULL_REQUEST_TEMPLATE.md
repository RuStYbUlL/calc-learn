## PR Checklist

Before requesting a review, please confirm:

- [ ] **Lint pass** – Code passes all lint checks (`npm run lint` / `pnpm lint` / equivalent).
- [ ] **Type pass** – Type checking passes with no errors (`npm run typecheck` / equivalent).
- [ ] **Tests pass** – All Playwright E2E tests (and any unit/integration tests) pass locally (`npm test` / equivalent).
- [ ] **Screenshots / GIFs attached** (if UI changes) – Include before/after visuals for easy review.
- [ ] **Migration tested** – Database migration applied, verified, and rolled back successfully (if applicable).
- [ ] **Performance note** – Document any performance impact (positive or negative).
- [ ] **Security note** – Document any security implications (permissions, data access changes, etc.).

---

### Description
> Briefly explain the purpose of this PR and the problem it solves.

### Related Issue(s)
> Link to related issues or tickets.

### Testing Notes
> Steps to test this change locally or in staging.

### Breaking Changes
> List any breaking changes or backward incompatibility.

### Additional Notes
> Any other context for reviewers.

---
_Last updated: 2025-08-14_
