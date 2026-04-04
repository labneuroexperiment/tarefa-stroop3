import App from '@/App.tsx'
import { renderToString } from 'react-dom/server'

interface PrerenderData {
  url: string
}

type PrerenderResult = string | {
  html?: string
  head?: {
    lang?: string
    title?: string
  }
  links?: Set<string> | string[]
} | null | undefined

export async function prerender(data: PrerenderData): Promise<PrerenderResult> {
  try {
    const html = renderToString(<App />)

    return {
      html,
      links: ['/'],
      head: {
        lang: 'pt-BR',
        title: 'Stroop Online UFPA - Pesquisa em Neurociência Cognitiva',
      },
    }
  } catch (e: any) {
    console.warn(`Failed to prerender "${data.url}":`, e.message)
    return null
  }
}
