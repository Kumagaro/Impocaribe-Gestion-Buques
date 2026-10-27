import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// Barreras de calidad del plan §11.3 (T007). Las pruebas de scripts/quality/lint-rules.test.ts demuestran cada una.
const TESTS = ['**/*.test.ts', '**/*.test.tsx'];
const INTEGRATION_TESTS = ['**/*.int.test.ts'];
const PRODUCTION = ['packages/*/src/**/*.{ts,tsx}'];
const DOMAIN = ['packages/shared/src/domain/**/*.ts'];
const PRESENTATIONS = ['packages/web/src/**/*.{phone,tablet,desktop}.tsx'];
const MOTION = ['packages/web/src/motion/**/*.{ts,tsx}'];

const testRules = [
  {
    selector:
      'MemberExpression[object.name=/^(it|test|describe|suite)$/][property.name=/^(skip|only|todo|skipIf|runIf)$/]',
    message: 'Prohibido saltar, filtrar o dejar pendientes pruebas (Const. art. XIII.4).',
  },
  {
    selector: 'CallExpression[callee.name=/^(xit|xtest|xdescribe|fit|fdescribe)$/]',
    message: 'Prohibido saltar o filtrar pruebas (Const. art. XIII.4).',
  },
  {
    selector: "CallExpression[callee.object.name='expect'][callee.property.name='anything']",
    message: 'Aserción débil: compare el valor exacto que pide la spec (Const. art. XIII.4).',
  },
  {
    selector: 'CallExpression[callee.property.name=/^(toBeTruthy|toBeFalsy|toBeDefined)$/]',
    message: 'Aserción débil: compare el valor exacto que pide la spec (Const. art. XIII.4).',
  },
  {
    selector: 'TryStatement',
    message: 'No capture errores en las pruebas: use expect(...).toThrow o rejects (Const. art. XIII.4).',
  },
];

const integrationRules = [
  {
    selector: "CallExpression[callee.object.name='vi'][callee.property.name=/^(mock|doMock|spyOn|stubGlobal)$/]",
    message: 'Las pruebas de integración no simulan la base de datos ni el dominio (Const. art. XIII.4).',
  },
];

const productionRules = [
  {
    selector: "MemberExpression[property.name='NODE_ENV']",
    message: 'El código de producción no consulta NODE_ENV: la configuración lo resuelve en config.ts (plan §11.3).',
  },
  {
    selector: "MemberExpression[property.name='VITEST']",
    message: 'El código de producción no puede saber si corre en pruebas (plan §11.3).',
  },
];

const domainRules = [
  {
    selector: "CallExpression[callee.name='parseFloat'], CallExpression[callee.name='Number']",
    message: 'Toneladas con aritmética exacta: use domain/tons.ts, nunca number (Const. art. V).',
  },
];

const MOTION_FORBIDDEN =
  '/^(width|height|minWidth|minHeight|maxWidth|maxHeight|top|left|right|bottom|margin\\w*|padding\\w*|border\\w*|background\\w*|color|boxShadow|filter|fontSize|lineHeight|letterSpacing)$/';
const motionRules = [
  {
    selector: `Property[key.name=${MOTION_FORBIDDEN}], Property[key.value=${MOTION_FORBIDDEN}]`,
    message: 'Solo se animan posición, escala y opacidad (ui-spec §3, Const. art. XIV.3).',
  },
];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/out/**',
      '**/coverage/**',
      '**/reports/**',
      '**/.stryker-tmp/**',
      '**/storybook-static/**',
      '**/test-results/**',
      '**/playwright-report/**',
      'packages/android/android/**',
      // T117: los instaladores generados y el server-bundle que arma T125.
      'packages/desktop/release/**',
      'packages/desktop/server-bundle/**',
      'docs/referencia/**',
      // Grafo de engram: artefactos generados, fuera del repositorio.
      '.engram/**',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    // Playwright lee de qué dependen las fixtures en el patrón de su primer argumento: `async ({}, use)` es obligatorio.
    files: ['packages/web/e2e/**/*.ts'],
    rules: { 'no-empty-pattern': 'off' },
  },
  {
    // Archivos de configuración y scripts que se ejecutan en Node
    files: ['**/*.config.{js,mjs}', 'packages/*/scripts/**/*.mjs'],
    languageOptions: { globals: { process: 'readonly', URL: 'readonly', console: 'readonly' } },
  },
  {
    files: PRODUCTION,
    ignores: [...TESTS, 'packages/server/src/config.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...productionRules],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['**/fixtures/**'], message: 'El código de producción no usa datos de prueba (plan §11.3).' },
          ],
        },
      ],
    },
  },
  {
    files: DOMAIN,
    ignores: TESTS,
    rules: { 'no-restricted-syntax': ['error', ...productionRules, ...domainRules] },
  },
  {
    files: MOTION,
    ignores: TESTS,
    rules: { 'no-restricted-syntax': ['error', ...productionRules, ...motionRules] },
  },
  {
    files: PRESENTATIONS,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/api',
                '**/api/**',
                '**/local',
                '**/local/**',
                '**/permissions',
                '**/permissions/**',
                '**/validation',
                '**/validation/**',
                '@impocaribe/shared/validation*',
                '@impocaribe/shared/permissions*',
              ],
              message:
                'Las presentaciones solo componen piezas del sistema de diseño: datos, validación y permisos vienen del hook (plan §7.3).',
            },
            { group: ['**/fixtures/**'], message: 'El código de producción no usa datos de prueba (plan §11.3).' },
          ],
        },
      ],
    },
  },
  {
    files: TESTS,
    rules: { 'no-restricted-syntax': ['error', ...testRules] },
  },
  {
    files: INTEGRATION_TESTS,
    rules: { 'no-restricted-syntax': ['error', ...testRules, ...integrationRules] },
  },
);
