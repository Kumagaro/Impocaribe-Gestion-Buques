import type { StorybookConfig } from '@storybook/react-vite';

// T018 · plan §7.2: catálogo de componentes. No forma parte de los instaladores (plan §10.7).
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  framework: { name: '@storybook/react-vite', options: {} },
};
export default config;
