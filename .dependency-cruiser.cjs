/**
 * Enforces the hexagonal dependency rule:
 *   core <- adapters <- player <- apps, core has no runtime dependencies, adapters do not
 *   import each other. See PLAN.md "Architecture" and "Engineering standards".
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'core-has-no-runtime-dependencies',
      comment:
        'The domain and application layer is pure TypeScript: no npm packages, no Node built-ins. Tests and contract tests may use vitest.',
      severity: 'error',
      from: { path: '^packages/core/src', pathNot: ['\\.test\\.ts$', '\\.contract\\.ts$'] },
      to: {
        dependencyTypes: [
          'npm',
          'npm-dev',
          'npm-optional',
          'npm-peer',
          'npm-bundled',
          'npm-no-pkg',
          'npm-unknown',
          'core',
          'unknown',
        ],
      },
    },
    {
      name: 'no-undeclared-dependencies',
      comment: 'Every package declares what it imports in its own package.json.',
      severity: 'error',
      from: {},
      to: { dependencyTypes: ['npm-no-pkg', 'npm-unknown'] },
    },
    {
      name: 'byte-layout-stays-in-format',
      comment: 'Only domain/format reads bytes; motion and optics receive decoded values.',
      severity: 'error',
      from: { path: '^packages/core/src/domain/(motion|optics)/' },
      to: { path: '^packages/core/src/shared/(binary/ByteReader|protobuf)/' },
    },
    {
      name: 'domain-does-not-know-use-cases',
      comment: 'Domain values and rules sit below the application services that use them.',
      severity: 'error',
      from: { path: '^packages/core/src/domain/', pathNot: '\\.test\\.ts$' },
      to: { path: '^packages/core/src/application/' },
    },
    {
      name: 'only-format-reads-through-ports',
      comment:
        'The format layer reads bytes through RandomAccessSource; every other domain folder is pure.',
      severity: 'error',
      from: { path: '^packages/core/src/domain/(?!format/)', pathNot: '\\.test\\.ts$' },
      to: { path: '^packages/core/src/ports/' },
    },
    {
      name: 'format-is-the-way-in',
      comment:
        'Format is the anti-corruption layer: it produces motion, optics and view values, never the reverse.',
      severity: 'error',
      from: {
        path: '^packages/core/src/domain/(motion|optics|view|playback)/',
        pathNot: '\\.test\\.ts$',
      },
      to: { path: '^packages/core/src/domain/format/' },
    },
    {
      name: 'ports-do-not-know-use-cases',
      comment: "Ports are the core's interfaces; the data crossing them lives with them.",
      severity: 'error',
      from: { path: '^packages/core/src/ports/' },
      to: { path: '^packages/core/src/application/' },
    },
    {
      name: 'core-does-not-know-outer-layers',
      severity: 'error',
      from: { path: '^packages/core/src' },
      to: { path: '^(packages/adapters|packages/player|apps|tools)/' },
    },
    {
      name: 'adapters-depend-only-on-core',
      comment:
        'Production code of an adapter never imports another adapter; tests may compose them.',
      severity: 'error',
      from: { path: '^packages/adapters/([^/]+)/src', pathNot: '\\.test\\.ts$' },
      to: { path: '^packages/adapters/(?!$1/)', pathNot: '^packages/adapters/$1/' },
    },
    {
      name: 'adapters-do-not-know-player-or-apps',
      severity: 'error',
      from: { path: '^packages/adapters/' },
      to: { path: '^(packages/player|apps|tools)/' },
    },
    {
      name: 'only-integration-tests-combine-adapters',
      comment:
        'tools/integration may depend on several adapters; other tools use the application API.',
      severity: 'error',
      from: { path: '^tools/(?!integration/)' },
      to: { path: '^packages/adapters/(?!node/)' },
    },
    {
      name: 'controls-do-not-know-the-element',
      comment:
        'The element composes the controls and hands them a host; the controls never reach back.',
      severity: 'error',
      from: { path: '^packages/player/src/controls/' },
      to: { path: '^packages/player/src/element/' },
    },
    {
      name: 'apps-use-the-player-not-the-adapters',
      comment: 'Apps compose the player; only the player composes adapters.',
      severity: 'error',
      from: { path: '^apps/' },
      to: { path: '^packages/adapters/' },
    },
    {
      name: 'player-is-not-imported-by-libraries',
      severity: 'error',
      from: { path: '^(packages/core|packages/adapters|tools)/' },
      to: { path: '^packages/player/' },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      from: {
        orphan: true,
        pathNot: ['\\.d\\.ts$', '(^|/)(index|vitest\\.config|vite\\.config)\\.ts$'],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)dist/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.base.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'types', 'default'],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
