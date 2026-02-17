/**
 * Predefined options for nail tech profile: Tools/Techniques and Designs.
 * Used in setup and profile editing.
 */

export const NAIL_TECH_TOOLS = [
  'Normal polish',
  'Gel polish',
  'Builder gel',
  'Hard gel',
  'Acrylic',
  'Gel-X / extensions',
  'Chrome',
  '3D materials (charms, gems)',
] as const;

export const NAIL_TECH_DESIGNS = [
  'French',
  'Chrome',
  'Ombré / aura',
  'Abstract',
  'Floral',
  'Minimalist',
  'Y2K',
  'Hand-painted designs',
  '3D designs',
  'Custom designs',
] as const;

export const TOOLS_LABEL = 'Tools / Techniques';
export const TOOLS_HINT = 'Basic professional tools are assumed.';

export const DESIGNS_LABEL = 'Designs';
export const DESIGNS_HINT = 'Select all styles you offer.';

/** Customer preferences: styles / services they're interested in */
export const CUSTOMER_PREFERENCES_OPTIONS = [
  'Gel manicures',
  'Acrylics',
  'Nail art',
  'French',
  'Simple polish',
  'Luxury / spa',
  'Nail art / designs',
  'Extensions',
  'Chrome / metallic',
  'Minimalist',
  'Custom / special requests',
] as const;

export const PREFERENCES_LABEL = 'Preferences';
export const PREFERENCES_HINT = 'Select what you\'re interested in (optional).';

/** Location options (single-select) */
export const LOCATION_OPTIONS = [
  'North',
  'West',
  'Central',
  'Collegetown',
  'Downtown',
  'Other',
] as const;
