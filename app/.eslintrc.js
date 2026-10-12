// ESLint for the React Native app. The rules below encode the project's
// TypeScript + React style guide; Prettier owns formatting.
// An exported function, component or factory result (`forwardRef(...)`,
// `createContext(...)`); plain constants and objects don't count.
const EXPORTED_FUNCTION =
  "ExportNamedDeclaration:matches([declaration.type='FunctionDeclaration'], [declaration.declarations.0.init.type=/^(ArrowFunctionExpression|FunctionExpression|CallExpression)$/])"

const STYLE_SYNTAX = [
  {
    selector: 'TSEnumDeclaration',
    message: 'Use an `as const` object and a derived union type, not an enum.',
  },
  {
    selector:
      'FunctionDeclaration:not([returnType.typeAnnotation.asserts=true])',
    message:
      'Use an arrow function. `function` declarations are only for overloads and assertion functions.',
  },
  {
    selector:
      'CallExpression[callee.property.name=/^(sort|reverse|splice)$/][arguments.length<=2]',
    // Hermes gets these from src/shared/polyfills/es2023.ts.
    message: 'Use the non-mutating toSorted, toReversed or toSpliced instead.',
  },
  {
    selector:
      'TSTypeAliasDeclaration[id.name=/(Props|Result)$/] > TSTypeLiteral > TSPropertySignature[readonly!=true]',
    message:
      'Props and hook result types are readonly: mark every property `readonly`.',
  },
  {
    selector: `${EXPORTED_FUNCTION} ~ ${EXPORTED_FUNCTION}`,
    message:
      'One exported component or function per file. Move this one to its own file named after it.',
  },
  {
    selector: 'ExportDefaultDeclaration',
    message: 'Use named exports only.',
  },
]

// Module-level mutable state: a top-level `let`, or a top-level Map/Set,
// outlives the component tree and changes without React knowing. UI state
// goes in a component or provider; state shared by windows belongs in the
// core. Applies to every source file, so moving state into a plain `.ts`
// file doesn't get around it; the allowed exceptions are listed below.
const MUTABLE_COLLECTION =
  'NewExpression[callee.name=/^(Map|Set|WeakMap|WeakSet)$/]'
const MODULE_STATE_SYNTAX = [
  {
    selector:
      "Program > VariableDeclaration[kind='let'], Program > ExportNamedDeclaration > VariableDeclaration[kind='let']",
    message:
      'No module-level `let`: keep state in a component, a provider or the core.',
  },
  {
    selector: `Program > VariableDeclaration > VariableDeclarator > ${MUTABLE_COLLECTION}, Program > ExportNamedDeclaration > VariableDeclaration > VariableDeclarator > ${MUTABLE_COLLECTION}`,
    message:
      'No module-level Map or Set: keep state in a component, a provider or the core.',
  },
]

const COMPONENT_SYNTAX = [
  {
    selector:
      "VariableDeclarator[id.name=/^[A-Z]/][init.type='ArrowFunctionExpression']:not([id.typeAnnotation]):not([init.typeParameters])",
    message:
      'Type components with FC: `const Name: FC<NameProps> = props => …` (generic components excepted).',
  },
]

const TS_RULES = {
  '@typescript-eslint/consistent-type-imports': [
    'error',
    { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
  ],
  '@typescript-eslint/no-import-type-side-effects': 'error',
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-non-null-assertion': 'error',
  '@typescript-eslint/consistent-type-assertions': [
    'error',
    { assertionStyle: 'never' },
  ],
  '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
  // Only strings go into template literals: a number is formatted on
  // purpose (String, toFixed, a format helper), so `${x}` can't print
  // "undefined", "NaN" or a float with 15 decimals by accident.
  '@typescript-eslint/restrict-template-expressions': [
    'error',
    {
      allowAny: false,
      allowBoolean: false,
      allowNullish: false,
      allowNumber: false,
      allowRegExp: false,
    },
  ],
  '@typescript-eslint/switch-exhaustiveness-check': [
    'error',
    { considerDefaultExhaustiveForUnions: false },
  ],
  // The project service already checks unused vars via tsc; keep ESLint's
  // version so `_`-prefixed parameters stay allowed.
  '@typescript-eslint/no-unused-vars': [
    'error',
    { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
  ],
}

module.exports = {
  root: true,
  // The Linux build (run-linux): the JS bundle and CMake output.
  ignorePatterns: ['linux/build/'],
  extends: ['@react-native', 'plugin:import/typescript'],
  plugins: ['prettier', 'import', 'react-refresh', 'sound-scraper'],
  settings: {
    'import/internal-regex': '^@(test)?/',
  },
  rules: {
    'prettier/prettier': 'error',
    'prefer-const': 'error',
    // A promise nobody awaits still says what happens when it fails
    // (`.catch(...)`), rather than `void` dropping the rejection.
    'no-void': 'error',
    // Static styles go in StyleSheet.create; inline objects only carry
    // values computed at render (skin rects, scale, progress).
    'react-native/no-inline-styles': 'error',
    'react/function-component-definition': [
      'error',
      {
        namedComponents: 'arrow-function',
        unnamedComponents: 'arrow-function',
      },
    ],
    'import/no-default-export': 'error',
    'import/first': 'error',
    'import/newline-after-import': 'error',
    'import/no-duplicates': ['error', { 'prefer-inline': true }],
    'import/order': [
      'error',
      {
        groups: [
          ['builtin', 'external'],
          'internal',
          ['parent', 'sibling', 'index'],
        ],
        pathGroups: [
          { pattern: '@/**', group: 'internal' },
          { pattern: '@test/**', group: 'internal' },
        ],
        'newlines-between': 'always',
        alphabetize: { order: 'asc', caseInsensitive: true },
      },
    ],
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['../*', '..'],
            message: 'Import from outside the folder with `@/`, not `../`.',
          },
          {
            group: ['*.ts', '*.tsx', '*.js', '*.jsx'],
            message: 'Leave the file extension off import paths.',
          },
        ],
      },
    ],
  },
  overrides: [
    {
      files: ['*.ts', '*.tsx'],
      extends: ['plugin:@typescript-eslint/strict-type-checked'],
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
      rules: {
        ...TS_RULES,
        // Data from the core has generated types (src/bridge/generated);
        // `unknown` is only for a type guard's input and caught errors.
        'sound-scraper/no-unknown-shape': 'error',
        'no-restricted-syntax': [
          'error',
          ...STYLE_SYNTAX,
          ...MODULE_STATE_SYNTAX,
        ],
      },
    },
    {
      files: ['*.tsx'],
      rules: {
        'react-refresh/only-export-components': 'error',
        // Components don't fetch: they read with use() under <Suspense>, or
        // call a use<Domain> hook when that reads cleaner.
        'sound-scraper/no-effect-fetch': 'error',
        // A couple of useState calls or one simple effect read fine inline;
        // past that, the component should call a use<Domain> hook instead.
        'sound-scraper/max-component-hooks': [
          'error',
          { state: 2, effects: 1 },
        ],
        'no-restricted-syntax': [
          'error',
          ...STYLE_SYNTAX,
          ...MODULE_STATE_SYNTAX,
          ...COMPONENT_SYNTAX,
        ],
      },
    },
    {
      // Codegen only finds a Turbo Module through an `interface Spec
      // extends TurboModule`; a type alias fails with "No TypeScript
      // interfaces extending TurboModule". The module itself is a named
      // export like everything else.
      files: ['src/bridge/Native*.ts'],
      rules: {
        '@typescript-eslint/consistent-type-definitions': 'off',
      },
    },
    {
      // Native components also need their props as an interface extending
      // ViewProps, and @react-native/babel-plugin-codegen only generates the
      // static view config (which Windows' Fabric needs) for
      // `export default codegenNativeComponent(...)`.
      files: ['src/**/*NativeComponent.ts'],
      rules: {
        '@typescript-eslint/consistent-type-definitions': 'off',
        'import/no-default-export': 'off',
        'no-restricted-syntax': [
          'error',
          ...STYLE_SYNTAX.filter(
            s => s.selector !== 'ExportDefaultDeclaration',
          ),
        ],
      },
    },
    {
      // Caught errors have no known shape, and the guard helpers take any
      // guard.
      files: [
        'src/shared/utils/guards/**',
        'src/shared/utils/errorText.ts',
        'src/shared/utils/onRejected.ts',
        'src/shared/components/AsyncBoundary/ErrorFallback.tsx',
      ],
      rules: {
        'no-restricted-syntax': ['error', ...STYLE_SYNTAX, ...COMPONENT_SYNTAX],
        'sound-scraper/no-unknown-shape': 'off',
      },
    },
    {
      // Module state that's still allowed. Keep this list short, and say
      // why each file is on it.
      files: [
        // Shared by every window on the one JS runtime. These move into the
        // core, with each window mirroring them through events, as
        // playlists.ts already does.
        'src/features/library/selection.ts',
        'src/features/library/refreshers.ts',
        'src/features/playback/playback.ts',
        'src/features/playlists/playlists.ts',
        'src/features/skins/skinStore.ts',
        'src/features/skins/doubleSizeStore.ts',
        'src/features/skins/imageRevision.ts',
        'src/features/skins/stage/stage.ts',
        'src/features/skins/windows.linux.ts',
        // Not UI state: a native module looked up once, an id counter, the
        // reads that failed (keyed weakly by their promise), and the
        // dev-build debugger console.
        'src/features/skins/stage/stageNative.ts',
        'src/features/editor/components/EditorPanel/model/newId.ts',
        'src/features/library/components/LibraryScreen/useRecordingList.ts',
        'src/roots/devConsole/addToDevConsole.ts',
      ],
      rules: {
        'no-restricted-syntax': ['error', ...STYLE_SYNTAX],
      },
    },
    {
      // Tests and their fakes keep what they record at module level.
      files: ['*.test.ts', 'vitest/**/*.ts'],
      excludedFiles: ['vitest/fakes/Native*.ts'],
      rules: {
        'no-restricted-syntax': ['error', ...STYLE_SYNTAX],
      },
    },
    {
      files: ['*.test.tsx'],
      rules: {
        'no-restricted-syntax': ['error', ...STYLE_SYNTAX, ...COMPONENT_SYNTAX],
      },
    },
    {
      // Tooling configs are CommonJS modules read by Node.
      files: [
        '*.config.js',
        '.eslintrc.js',
        '.prettierrc.js',
        'scripts/**',
        'eslint-rules/**',
      ],
      rules: {
        'import/no-default-export': 'off',
      },
    },
    {
      // Vitest reads its config's default export.
      files: ['vitest.config.ts'],
      rules: {
        'import/no-default-export': 'off',
        'no-restricted-syntax': [
          'error',
          ...STYLE_SYNTAX.filter(
            s => s.selector !== 'ExportDefaultDeclaration',
          ),
        ],
      },
    },
  ],
}
