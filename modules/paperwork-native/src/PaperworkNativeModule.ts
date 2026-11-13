import { NativeModule, requireNativeModule } from 'expo';

export interface ImportedPage {
  name: string;
  thumb: string;
  text: string;
  bytes: number;
}

declare class PaperworkNativeModule extends NativeModule {
  /** Opens the system document scanner. Empty array when the user cancels. */
  scan(pageLimit: number): Promise<string[]>;
  hasPendingScan(): boolean;
  /** Pages from a scan that completed after Android restarted the app. Returned once. */
  takePendingScan(): string[];
  importPage(sourceUri: string, baseName: string): Promise<ImportedPage>;
  discardSource(uri: string): void;
  openPage(relativeName: string): Promise<string>;
  clearPlainCache(): void;
  sweepCaches(): void;
  sweepOrphans(keepDocIds: string[]): Promise<number>;
  deleteDocumentFiles(docId: string): Promise<void>;
  wipeVault(): Promise<void>;
  exportPage(relativeName: string, fileName: string): Promise<string>;
  exportPdf(relativeNames: string[], fileName: string): Promise<string>;
  setSecure(secure: boolean): void;
}

export default requireNativeModule<PaperworkNativeModule>('PaperworkNative');
