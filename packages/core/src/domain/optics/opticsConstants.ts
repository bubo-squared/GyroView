import { degrees, degreesToRadians } from '../../shared/units/angle';

/**
 * Insta360 X-series lenses image about 200 degrees: the half field beyond which a lens sees
 * nothing, and the gate every model refuses directions past.
 */
const FIELD_EDGE_DEGREES = 100;

export const HALF_FIELD_OF_VIEW = degreesToRadians(degrees(FIELD_EDGE_DEGREES));

/**
 * The direction the legacy calibration's radius marks, from the lens axis: where Insta360
 * Studio's stitch of the sailing X5 puts the far field, and where that unit's seam draws far
 * content in one place (ADR 0023). The office X5's seam wants 97 degrees; the reading is open.
 */
const LEGACY_RADIUS_DEGREES = 96;

export const LEGACY_RADIUS_ANGLE = degreesToRadians(degrees(LEGACY_RADIUS_DEGREES));
