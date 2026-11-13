import Native from '../../modules/paperwork-native';
import type { PageRow } from './db';
import { newId } from './db';
import { analyze } from './extract';
import type { Analysis } from './extract';

export interface Captured {
  docId: string;
  pages: PageRow[];
  text: string;
  analysis: Analysis;
}

export interface Step {
  page: number;
  total: number;
}

/**
 * For each page: decode it at a safe size, read its text on the device, encrypt the page and a
 * thumbnail into private storage, and delete the plaintext source. If anything fails, or the
 * caller cancels, everything stored for this document is removed again.
 */
export async function processPages(sources: string[], onStep: (step: Step) => void, isCancelled: () => boolean): Promise<Captured | null> {
  const docId = newId();
  const pages: PageRow[] = [];
  const texts: string[] = [];
  try {
    for (let i = 0; i < sources.length; i++) {
      if (isCancelled()) throw new Error('cancelled');
      onStep({ page: i + 1, total: sources.length });
      const page = await Native.importPage(sources[i], `${docId}/page-${i + 1}`);
      pages.push({ name: page.name, thumb: page.thumb });
      texts.push(page.text);
    }
    if (isCancelled()) throw new Error('cancelled');
  } catch (error) {
    await Native.deleteDocumentFiles(docId).catch(() => {});
    sources.forEach((s) => {
      try {
        Native.discardSource(s);
      } catch {
        // Best effort.
      }
    });
    if (isCancelled()) return null;
    throw error;
  }
  const text = texts.join('\n\n').trim();
  return { docId, pages, text, analysis: analyze(text) };
}

export { Native };
