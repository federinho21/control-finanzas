// https://nuxt.com/docs/api/configuration/nuxt-config
declare const process: {
  env: Record<string, string | undefined>
}

import tailwindcss from '@tailwindcss/vite'

if (process.env.DEPLOY_TARGET === 'cloudflare' || process.env.NITRO_PRESET === 'netlify_edge') throw new Error('Firebase Admin requires Node. Use Netlify Functions, not Workers or Edge Functions.')

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/ui', '@nuxt/fonts'],
  colorMode: {
    preference: 'dark',
    fallback: 'dark',
    classSuffix: '',
  },
  nitro: {
    preset: process.env.NITRO_PRESET === 'netlify' || process.env.NETLIFY === 'true' ? 'netlify' : 'node-server',
    externals: { inline: ['firebase-admin', 'jwks-rsa', 'jose'] },
    commonJS: { requireReturnsDefault: 'preferred', ignoreTryCatch: false }
  },
  fonts: {
    families: [
      {
        name: 'DM Sans',
        provider: 'google',
        weights: [400, 500, 600, 700],
        styles: ['normal']
      }
    ]
  },
  css: ['~/assets/css/main.css'],
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      include: [
        '@vue/devtools-core',
        '@vue/devtools-kit',
        'nanoid',
        '@internationalized/date',
        'markdown-it',
        'chart.js',
        'vue-chartjs',
      ]
    }
  },
  runtimeConfig: {
    geminiApiKey: process.env.GEMINI_API_KEY,
    public: {
      firebase: {
        apiKey: '',
        authDomain: '',
        projectId: '',
        appId: ''
      }
    }
  }
})
