// eslint.config.js
import js from '@eslint/js';
import globals from 'globals';

export default [
    js.configs.recommended,
    {
        files: ['**/*.js'],
        languageOptions: {
            globals: {
                ...globals.browser,
                sap: 'readonly',
                jQuery: 'readonly'
            },
            ecmaVersion: 'latest'
        },
        rules: {
            // Core JavaScript rules
            'no-unused-vars': ['error', {
                vars: 'all',
                args: 'after-used',
                ignoreRestSiblings: false,
                varsIgnorePattern: '^on[A-Z]|^_', // Ignore UI5 lifecycle & private methods
            }],
            'no-undef': 'error',
            'no-unreachable': 'error',
            // Detect duplicate methods
            'no-dupe-class-members': 'error',
            // UI5-specific patterns to flag
            'no-alert': 'error',
            'no-console': 'warn',

            // Code quality
            'no-dupe-keys': 'error',
            // Detect redundant code blocks
            'no-useless-return': 'error',
            'no-empty-function': 'error',
        }
    },
    {
        files: ['webapp/*/**/*.js'],
        rules: {
            // Controller-specific rules
            'no-unused-vars': ['error', {
                varsIgnorePattern: '^on[A-Z]' // Allow event handlers like onInit
            }],
            'max-lines-per-function': ['warn', 40]
        }
    },
    {
        files: ['webapp/model/**/*.js'],
        rules: {
            // Model-specific rules
            'no-param-reassign': ['error', {
                props: true
            }]
        }
    },
    {
        files: ['webapp/util/**/*.js'],
        rules: {
            // Utility-specific rules
            'consistent-return': 'error'
        }
    }
];