import nextConfig from 'eslint-config-next';

const eslintConfig = [
  ...nextConfig,
  {
    rules: {
      '@next/next/no-html-link-for-pages': 'error',
      '@next/next/no-sync-scripts': 'error',
    },
  },
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'dist/**',
      'out/**',
      'build/**',
      'next-env.d.ts',
      'eslint.config.mjs',
      'next.config.mjs',
      'postcss.config.mjs',
    ],
  },
];

export default eslintConfig;
