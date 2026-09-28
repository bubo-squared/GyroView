import { degrees, degreesToRadians } from '../../shared/units/angle';

/**
 * Insta360 X-series lenses image about 200 degrees: the half field beyond which a lens sees
 * nothing, and the gate every model refuses directions past.
 */
const FIELD_EDGE_DEGREES = 100;

export const HALF_FIELD_OF_VIEW = degreesToRadians(degrees(FIELD_EDGE_DEGREES));

/**
 * The direction the legacy calibration's radius marks, from the lens axis. Measured against
 * Insta360 Studio's stitch of the sailing recording (ADR 0023): read as 100 degrees, both the
 * equidistant and the Mei models draw every direction 3 to 5 percent too close to the axis,
 * and the far field matches the export best with the radius at 95 to 97 degrees. omnikit reads
 * it as 95.
 */
const LEGACY_RADIUS_DEGREES = 96;

export const LEGACY_RADIUS_ANGLE = degreesToRadians(degrees(LEGACY_RADIUS_DEGREES));
