// https://nuxt.com/docs/api/configuration/nuxt-config
declare const process: {
  env: Record<string, string | undefined>
}

import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/ui', '@nuxt/fonts'],
  colorMode: {
    classSuffix: '',
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
    geminiApiKey: process.env.GEMINI_API_KEY
  }
})
