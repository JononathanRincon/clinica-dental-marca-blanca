import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';

export default defineConfig({
  output: 'server',
  adapter: vercel({
    webAnalytics: {
      enabled: false,
    },
  }),
  integrations: [
    tailwind({
      applyBaseStyles: true,
    }),
    react(),
  ],
  image: {
    domains: ['lh3.googleusercontent.com'],
  },
});
