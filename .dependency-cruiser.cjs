/**
 * Enforces the hexagonal dependency rule:
 *   core <- adapters <- player <- apps, core has no runtime dependencies, adapters do not
 *   import each other. See docs/ARCHITECTURE.md and CONTRIBUTING.md.
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
      comment:
        'Only domain/format reads bytes; everything else in the core receives decoded values.',
      severity: 'error',
      from: {
        path: '^packages/core/src/(?!domain/format/|shared/|testing/)',
        pathNot: '\\.test\\.ts$',
      },
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
        "Format is the anti-corruption layer: it produces the other domain folders' values, never the reverse.",
      severity: 'error',
      from: { path: '^packages/core/src/domain/(?!format/)', pathNot: '\\.test\\.ts$' },
      to: { path: '^packages/core/src/domain/format/' },
    },
    {
      name: 'only-recording-knows-the-format',
      comment:
        'The ports and every use case but reading a recording know nothing of .insv: their vocabulary lives with the ports and the domain.',
      severity: 'error',
      from: {
        path: '^packages/core/src/(ports|application/(?!recording/))',
        pathNot: '\\.test\\.ts$',
      },
      to: { path: '^packages/core/src/domain/format/' },
    },
    {
      name: 'playback-knows-only-ports-and-its-state',
      comment:
        'Playback is generic transport: motion and optics reach it only as sink decorators the composition root wires.',
      severity: 'error',
      from: { path: '^packages/core/src/application/playback/', pathNot: '\\.test\\.ts$' },
      to: {
        path: '^packages/core/src/',
        pathNot: '^packages/core/src/(ports|shared|domain/playback|application/playback)/',
      },
    },
    {
      name: 'use-cases-do-not-know-each-other',
      comment:
        'Each application folder is one use case; what two need is domain or port vocabulary.',
      severity: 'error',
      from: { path: '^packages/core/src/application/([^/]+)/', pathNot: '\\.test\\.ts$' },
      to: {
        path: '^packages/core/src/application/',
        pathNot: '^packages/core/src/application/$1/',
      },
    },
    {
      name: 'shared-is-a-leaf',
      comment: 'Units, maths, errors and bytes know nothing of the domain above them.',
      severity: 'error',
      from: { path: '^packages/core/src/shared/' },
      to: { path: '^packages/core/src/(?!shared/)' },
    },
    {
      name: 'production-code-does-not-use-test-support',
      comment:
        "The core's fakes, contracts and fixture builders serve tests and the fixtures tool only.",
      severity: 'error',
      from: {
        path: '^(packages|apps)/[^/]+/(src|[^/]+/src)/',
        pathNot: [
          '\\.test\\.ts$',
          '\\.contract\\.ts$',
          '/src/test/',
          '^packages/core/src/testing/',
        ],
      },
      to: { path: '^packages/core/src/testing/' },
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
      from: {
        path: '^packages/adapters/([^/]+)/src',
        pathNot: ['\\.test\\.ts$', '/src/test/'],
      },
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
      name: 'only-the-composition-imports-adapters',
      comment:
        'Inside the player, the composition chooses and wires the adapters; the player, the element and the controls never touch WebCodecs, Three.js or MSE themselves.',
      severity: 'error',
      from: {
        path: '^packages/player/src/(?!composition/)',
        pathNot: '\\.test\\.ts$',
      },
      to: { path: '^packages/adapters/' },
    },
    {
      name: 'the-composition-does-not-know-the-player',
      comment:
        'The composition sits below the player: it opens recordings and builds pipelines for whoever drives them.',
      severity: 'error',
      from: { path: '^packages/player/src/composition/', pathNot: '\\.test\\.ts$' },
      to: { path: '^packages/player/src/(player/|element/|controls/|browserPlayer\\.ts)' },
    },
    {
      name: 'the-player-does-not-know-the-element',
      comment: 'The headless player is driven by the element, never the other way round.',
      severity: 'error',
      from: { path: '^packages/player/src/player/', pathNot: '\\.test\\.ts$' },
      to: { path: '^packages/player/src/(element|controls)/' },
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
      name: 'the-embed-snippet-carries-no-player-code',
      comment:
        'embed.js only talks to the frame: the snippet, the protocol and the page side of the bridge take types and attribute names from the player, never its code.',
      severity: 'error',
      from: { path: '^apps/embed/src/(snippet|protocol|bridge)/', pathNot: '\\.test\\.ts$' },
      to: {
        path: '^packages/player/',
        pathNot: '^packages/player/src/element/attributeNames\\.ts$',
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'the-embed-snippet-does-not-reach-the-frame-side',
      comment:
        'The frame side imports the player, so a value import of it from the snippet side would bundle the player into embed.js through it.',
      severity: 'error',
      from: { path: '^apps/embed/src/(snippet|protocol|bridge)/', pathNot: '\\.test\\.ts$' },
      to: {
        path: '^apps/embed/src/(frame/|pages/|component\\.ts$)',
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'player-is-not-imported-by-libraries',
      comment: 'The real-recording tests open samples through the player composition they test.',
      severity: 'error',
      from: { path: '^(packages/core|packages/adapters|tools/(?!integration/))' },
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
