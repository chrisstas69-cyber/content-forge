import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ContentForge',
    short_name: 'ContentForge',
    description: 'AI Content Automation Platform',
    start_url: '/',
    display: 'standalone',
    background_color: '#141414',
    theme_color: '#ea580c',
    icons: [
      {
        src: 'https://z-cdn.chatglm.cn/z-ai/static/logo.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  }
}
