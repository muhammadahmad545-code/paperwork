import { NativeModule, requireNativeModule } from 'expo';

declare class PaperworkNativeModule extends NativeModule {
  /** Opens the system document scanner. Empty array when the user cancels. */
  scan(pageLimit: number): Promise<string[]>;
  recognize(uri: string): Promise<string>;
  importPage(sourceUri: string, relativeName: string): Promise<number>;
  openPage(relativeName: string): Promise<string>;
  clearPlainCache(): void;
  deletePages(relativeNames: string[]): Promise<void>;
  exportPdf(relativeNames: string[], fileName: string): Promise<string>;
}

export default requireNativeModule<PaperworkNativeModule>('PaperworkNative');
