import type { ScanPageResult, ScannedElement } from '../types';

export class ScanStore {
  private result: ScanPageResult | null = null;
  private selectedElementId: string | null = null;

  setResult(result: ScanPageResult): void {
    this.result = result;
    this.selectedElementId = result.elements[0]?.id ?? null;
  }

  getResult(): ScanPageResult | null {
    return this.result;
  }

  getElements(): ScannedElement[] {
    return this.result?.elements ?? [];
  }

  getSelected(): ScannedElement | undefined {
    if (!this.result || !this.selectedElementId) {
      return undefined;
    }
    return this.result.elements.find((e) => e.id === this.selectedElementId);
  }

  select(elementId: string): ScannedElement | undefined {
    this.selectedElementId = elementId;
    return this.getSelected();
  }

  findById(elementId: string): ScannedElement | undefined {
    return this.result?.elements.find((e) => e.id === elementId);
  }

  clear(): void {
    this.result = null;
    this.selectedElementId = null;
  }
}

export const scanStore = new ScanStore();
