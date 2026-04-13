# Contributing Guide

Thanks for your interest in NASGE! Whether it's reporting bugs, suggesting features, or submitting code, all contributions are welcome.

**[中文版](CONTRIBUTING.md)**

---

## Code of Conduct

- Be respectful and constructive
- Contributors of all skill levels are welcome
- Issues and PR discussions in Chinese or English are both fine

## How to Contribute

### Report Bugs / Suggest Features

File an issue on [GitHub Issues](https://github.com/JohnS3248/NASGE/issues). Please include:

- **Bug reports**: What happened vs. expected behavior, browser version, extension version, reproduction steps, screenshots (if UI-related)
- **Feature requests**: Describe the use case and desired behavior

### Submit Code

1. **Fork and clone the repo**
   ```bash
   git clone https://github.com/<your-username>/NASGE.git
   cd NASGE
   ```

2. **Install dependencies** (Node.js required, see `.nvmrc` for version)
   ```bash
   npm install
   ```

3. **Create a branch**
   ```bash
   git checkout -b feat/my-feature
   ```

4. **Start dev mode**
   ```bash
   npm run dev:extension
   ```
   In Chrome, go to `chrome://extensions` → enable Developer mode → Load unpacked → select the `dist/` folder.

5. **Make changes and verify**
   ```bash
   npm run type-check   # TypeScript type check
   npm run test         # Unit tests
   npm run build        # Production build
   ```
   UI and extension features require manual verification in Chrome.

6. **Submit a PR** — Push your branch and open a Pull Request against `main`, filling out the PR template.

## Commit Conventions

Use [Conventional Commits](https://www.conventionalcommits.org/) format:

```
type(scope): description
```

**Types:**

| Type | Purpose |
|------|---------|
| `feat` | New feature |
| `fix` | Bug fix |
| `refactor` | Refactor (no behavior change) |
| `test` | Tests |
| `docs` | Documentation |
| `style` | Code style (formatting, not UI) |
| `ci` | CI/CD |
| `chore` | Miscellaneous |

**Common scopes:** `editor`, `bbcode`, `content`, `background`, `popup`, `store`, `i18n`, `imagePanel`, `build`

Descriptions in Chinese or English are both fine.

## PR Checklist

The [PR template](.github/PULL_REQUEST_TEMPLATE.md) loads automatically. Make sure:

- `npm run type-check` passes
- `npm run test` passes
- `npm run build` passes
- Touching BBCode conversion → roundtrip tests all green
- Adding user-visible text → i18n keys added to both `zh-CN` and `en-US`
- Adding Chrome permissions → explain in PR description
- Touching UI → attach screenshots or screencast

## i18n Requirements

All user-visible text must use i18n keys — no hardcoded Chinese or English strings. New keys must be added to both `src/i18n/locales/zh-CN/` and `src/i18n/locales/en-US/` JSON files simultaneously.

See `.claude/rules/i18n.md` for details.

## Testing Philosophy

NASGE's testing approach is to **guard against fatal risks, not chase coverage**. See [TESTING.md](TESTING.md) for details.

- Modifying BBCode conversion or Store persist structure → tests required
- Modifying React components or TipTap extensions → describe manual verification steps and results in the PR

## License

Contributions are licensed under this project's [MIT License](LICENSE).
