# rgb-curve — Vendored Dependency

- **Original package**: `rgb-curve` v1.0.2
- **Author**: Sounak Das (contact@sounakdas.in)
- **License**: MIT
- **Repository**: https://github.com/LittleBoy9/rgb-curve
- **Build command**: `npm install && npm run build:lib`

## Why vendored

The npm publish of `rgb-curve@1.0.2` is missing the `dist/` directory (only
README.md and package.json are in the tarball — `fileCount: 2`). The package
declares `"main": "dist/index.js"` but the build output is absent.

This copy was built from the GitHub source (commit: latest main) using:
```bash
git clone --depth 1 https://github.com/LittleBoy9/rgb-curve.git
cd rgb-curve
npm install
npm run build:lib
cp dist/index.js dist/index.mjs dist/index.d.ts → this directory
```

Only the production files are kept; source maps are excluded.

## Files

- `index.js`  — CommonJS build
- `index.mjs` — ESM build
- `index.d.ts` — TypeScript declarations
