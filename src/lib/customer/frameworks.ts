/**
 * Which disclosure area each report section could support, per reporting framework. This is configuration, not
 * advice: the entries are topic-level pointers written without checking the current official standard text, and
 * none assigns a GHG Protocol scope, because that depends on the customer's organisational and operational
 * boundary and on who controls the activity. A reporting lead confirms every row before it is used. The output is
 * a data export that may feed a disclosure. It is not proof of compliance with any framework.
 */
export type FrameworkId = 'none' | 'ghg' | 'gri' | 'esrs' | 'ifrs_s2';

export type SectionId = 'inventory' | 'operations' | 'lifecycle' | 'energy' | 'social' | 'governance';

export interface Framework {
  id: FrameworkId;
  name: string;
  /** Candidate disclosure areas by section. Absent means no obvious pointer, not "not applicable". */
  areas: Partial<Record<SectionId, string>>;
}

export const FRAMEWORKS: Framework[] = [
  { id: 'none', name: 'No framework selected', areas: {} },
  {
    id: 'ghg', name: 'GHG Protocol (corporate accounting)',
    areas: {
      energy: 'Activity data (energy used, distance and mass transported) that an inventory may need. The scope and category depend on the boundary the customer sets.',
      lifecycle: 'End-of-life treatment of products may relate to a value-chain category. Confirm the category against the customer’s boundary.',
    },
  },
  {
    id: 'gri', name: 'GRI Standards',
    areas: {
      energy: 'Energy and emissions topics (for example the GRI 302 and 305 families). Confirm the current topic standards.',
      lifecycle: 'Waste and materials topics (for example the GRI 301 and 306 families). Confirm the current topic standards.',
      social: 'Occupational health and safety topics (for example the GRI 403 family), if source data exists.',
      governance: 'Reporting principles: accuracy, completeness, and how information was prepared.',
    },
  },
  {
    id: 'esrs', name: 'ESRS (CSRD)',
    areas: {
      energy: 'Climate change topic (ESRS E1). Disclosure requirements and phase-in change over time: check the current text.',
      lifecycle: 'Resource use and circular economy topic (ESRS E5). Check the current text.',
      social: 'Workers in the own workforce topic (ESRS S1), if source data exists.',
      governance: 'Basis for preparation and data-quality statements (ESRS 1 and ESRS 2). Check the current text.',
    },
  },
  {
    id: 'ifrs_s2', name: 'IFRS S2 (climate-related disclosures)',
    areas: {
      energy: 'Greenhouse gas emissions and energy metrics, with the measurement approach stated.',
      governance: 'Statement of the measurement approach, inputs and assumptions.',
    },
  },
];

export const frameworkOf = (id: FrameworkId): Framework => FRAMEWORKS.find((f) => f.id === id) ?? FRAMEWORKS[0]!;
