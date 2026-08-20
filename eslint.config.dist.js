import stylistic from '@stylistic/eslint-plugin';

export default [
    {
        files: ['**/*.js'],
        plugins: {
            '@stylistic': stylistic,
        },
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
        },
        rules: {
            '@stylistic/indent': ['error', 4],
            '@stylistic/quotes': ['error', 'single', {avoidEscape: true}],
            '@stylistic/semi': ['error', 'always'],
            '@stylistic/object-curly-spacing': ['error', 'never'],
            '@stylistic/comma-dangle': ['error', 'never'],
            '@stylistic/eol-last': ['error', 'always'],
            '@stylistic/lines-between-class-members': ['error', {
                enforce: [
                    {blankLine: 'never', prev: 'field', next: 'field'},
                    {blankLine: 'always', prev: 'field', next: 'method'},
                    {blankLine: 'always', prev: 'method', next: 'method'},
                ],
            }],
            '@stylistic/padding-line-between-statements': [
                'error',
                {blankLine: 'always', prev: 'import', next: '*'},
                {blankLine: 'any', prev: 'import', next: 'import'},
                {blankLine: 'always', prev: '*', next: 'function'},
                {blankLine: 'always', prev: 'function', next: '*'},
                {blankLine: 'always', prev: '*', next: 'export'},
            ],
        },
    },
];
