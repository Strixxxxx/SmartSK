/** Parse year range from filename, e.g. "CBYDP_SB_2023-2025.xlsx" → ["2023","2024","2025"] */
export function parseYearRange(fileName: string): string[] {
    const match = fileName.match(/(\d{4})-(\d{4})/);
    if (!match) return ['Year 1', 'Year 2', 'Year 3'];
    const start = parseInt(match[1], 10);
    const end = parseInt(match[2], 10);
    const years: string[] = [];
    for (let y = start; y <= end; y++) years.push(String(y));
    return years.slice(0, 3); // DB supports max 3
}

export interface AbyipRow {
    rowID: number;
    sheetRowIndex?: number;
    referenceCode?: string;
    PPA?: string;
    Description?: string;
    expectedResult?: string;
    performanceIndicator?: string;
    period?: string;
    PS?: string;
    MOOE?: string;
    CO?: string;
    total?: string;
    personResponsible?: string;
}

export interface CbydpRow {
    rowID: number;
    sheetRowIndex?: number;
    YDC?: string;
    objective?: string;
    performanceIndicator?: string;
    target1?: string;
    target2?: string;
    target3?: string;
    PPAs?: string;
    budget?: string;
    personResponsible?: string;
    sectionType?: 'FROM' | 'TO' | 'ADDITIONAL PROJECT';
}
