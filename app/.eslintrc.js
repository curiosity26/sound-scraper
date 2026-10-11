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
    // Hermes gets these from src/polyfills/es2023.ts.
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
  // Numbers read naturally in messages ("3 tracks"); everything else still
  // has to be a string.
  '@typescript-eslint/restrict-template-expressions': [
    'error',
    { allowNumber: true },
  ],
  '@typescript-eslint/switch-exhaustiveness-check': [
    'error',
    { considerDefaultExhaustiveForUnions: true },
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
  extends: ['@react-native', 'plugin:import/typescript'],
  plugins: ['prettier', 'import', 'react-refresh', 'sound-scraper'],
  settings: {
    'import/internal-regex': '^@/',
  },
  rules: {
    'prettier/prettier': 'error',
    'prefer-const': 'error',
    // `void promise()` marks a deliberate fire-and-forget call.
    'no-void': ['error', { allowAsStatement: true }],
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
        pathGroups: [{ pattern: '@/**', group: 'internal' }],
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
        // Data from the core has generated types (src/native/bridge);
        // `unknown` is only for a type guard's input and caught errors.
        'sound-scraper/no-unknown-shape': 'error',
        'no-restricted-syntax': ['error', ...STYLE_SYNTAX],
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
        'no-restricted-syntax': ['error', ...STYLE_SYNTAX, ...COMPONENT_SYNTAX],
      },
    },
    {
      // React Native codegen reads these specs literally: it requires an
      // `interface Spec extends TurboModule` (or props interface) and a
      // default export of the registry lookup.
      files: ['src/native/Native*.ts', 'src/**/*NativeComponent.ts'],
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
        'src/utils/guards/**',
        'src/utils/errorText.ts',
        'src/components/AsyncBoundary/ErrorFallback.tsx',
      ],
      rules: {
        'no-restricted-syntax': ['error', ...STYLE_SYNTAX, ...COMPONENT_SYNTAX],
        'sound-scraper/no-unknown-shape': 'off',
      },
    },
    {
      files: ['__tests__/**', '*.test.ts', '*.test.tsx'],
      env: { jest: true },
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
  ],
}
