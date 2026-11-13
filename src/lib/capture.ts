import Native from '../../modules/paperwork-native';
import { analyze } from './extract';
import type { Analysis } from './extract';
import { newId } from './db';

export interface Captured {
  docId: string;
  pages: string[];
  text: string;
  analysis: Analysis;
}

export type Step = { stage: 'reading'; page: number; total: number } | { stage: 'securing'; page: number; total: number };

/**
 * For each page: read its text on the device, then encrypt the image into private storage.
 * If anything fails, pages already stored for this document are removed again.
 */
export async function processPages(sources: string[], onStep: (step: Step) => void): Promise<Captured> {
  const docId = newId();
  const stored: string[] = [];
  const texts: string[] = [];
  try {
    for (let i = 0; i < sources.length; i++) {
      onStep({ stage: 'reading', page: i + 1, total: sources.length });
      try {
        texts.push(await Native.recognize(sources[i]));
      } catch {
        // A page with no readable text is still worth keeping.
        texts.push('');
      }
      onStep({ stage: 'securing', page: i + 1, total: sources.length });
      const name = `${docId}/page-${i + 1}.jpg`;
      await Native.importPage(sources[i], name);
      stored.push(name);
    }
  } catch (error) {
    await Native.deletePages(stored).catch(() => {});
    throw error;
  }
  const text = texts.join('\n\n').trim();
  return { docId, pages: stored, text, analysis: analyze(text) };
}

export { Native };
