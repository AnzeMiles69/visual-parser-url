import { selectElementsForPageObject } from '../generator/pageObjectGenerator';
import type { ScanPageResult, ScannedElement } from '../types';

export class ScanStore {
  private result: ScanPageResult | null = null;
  private selectedElementId: string | null = null;
  /** Элементы, отмеченные галочкой для генерации POM */
  private includedIds = new Set<string>();

  setResult(result: ScanPageResult): void {
    this.result = result;
    this.selectedElementId = result.elements[0]?.id ?? null;
    // по умолчанию — только то, что генератор и так взял бы в POM (без футер-мусора по фильтру)
    const defaults = selectElementsForPageObject(result.elements);
    this.includedIds = new Set(defaults.map((el) => el.id));
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

  isIncluded(elementId: string): boolean {
    return this.includedIds.has(elementId);
  }

  setIncluded(elementId: string, included: boolean): void {
    if (included) {
      this.includedIds.add(elementId);
    } else {
      this.includedIds.delete(elementId);
    }
  }

  setIncludedMany(elementIds: string[], included: boolean): void {
    for (const id of elementIds) {
      this.setIncluded(id, included);
    }
  }

  includeAll(): void {
    this.includedIds = new Set(this.getElements().map((el) => el.id));
  }

  includeNone(): void {
    this.includedIds.clear();
  }

  /** Вернуть галочки к «умному» дефолту (как после скана) */
  resetInclusionToDefaults(): void {
    if (!this.result) {
      return;
    }
    const defaults = selectElementsForPageObject(this.result.elements);
    this.includedIds = new Set(defaults.map((el) => el.id));
  }

  /** Элементы с галочкой, в порядке скана */
  getIncludedElements(): ScannedElement[] {
    if (!this.result) {
      return [];
    }
    return this.result.elements.filter((el) => this.includedIds.has(el.id));
  }

  getInclusionStats(): { included: number; total: number } {
    return {
      included: this.includedIds.size,
      total: this.getElements().length,
    };
  }

  clear(): void {
    this.result = null;
    this.selectedElementId = null;
    this.includedIds.clear();
  }
}

export const scanStore = new ScanStore();
