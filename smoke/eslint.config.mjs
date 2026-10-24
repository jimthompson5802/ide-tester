import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    { ignores: ['dist/**', 'helper/dist/**', 'node_modules/**'] },
    {
        files: [
            'src/**/*.ts',
            'tests/**/*.ts',
            'gui/**/*.ts',
            'helper/extension.ts',
        ],
        extends: [js.configs.recommended, ...tseslint.configs.recommended],
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            // Existing dynamic test doubles and external data need a separate typing pass.
            '@typescript-eslint/no-explicit-any': 'off',
            'no-constant-condition': ['error', { checkLoops: false }],
            '@typescript-eslint/no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_', caughtErrors: 'none' },
            ],
            '@typescript-eslint/consistent-type-imports': [
                'error',
                { fixStyle: 'inline-type-imports' },
            ],
            '@typescript-eslint/no-floating-promises': [
                'error',
                { ignoreVoid: false },
            ],
        },
    },
    {
        files: ['tests/**/*.ts'],
        rules: {
            // Node's runner owns test registration promises and reports callback failures.
            '@typescript-eslint/no-floating-promises': [
                'error',
                {
                    ignoreVoid: false,
                    allowForKnownSafeCalls: [
                        {
                            from: 'package',
                            package: '@types/node',
                            name: 'test',
                        },
                    ],
                },
            ],
        },
    },
);
