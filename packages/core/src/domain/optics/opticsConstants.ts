import { degrees, degreesToRadians } from '../../shared/units/angle';

/**
 * Insta360 X-series lenses cover about 200 degrees. The legacy calibration stores only a radius,
 * and on both X5 sample lenses that radius equals the MEI model's radius at exactly 100 degrees
 * to within a couple of pixels, so the radius is taken to mark the 100-degree field edge.
 */
const FIELD_EDGE_DEGREES = 100;

export const HALF_FIELD_OF_VIEW = degreesToRadians(degrees(FIELD_EDGE_DEGREES));
