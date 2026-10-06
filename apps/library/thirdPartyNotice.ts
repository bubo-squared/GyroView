/**
 * The notice a bundle that compiles in three.js and mediabunny carries, beside their own legal
 * comments (`output.comments.legal`): mediabunny's MPL-2.0 asks that whoever receives it in
 * compiled form learns where its source is.
 */
export const THIRD_PARTY_NOTICE = `/*! @bubo-squared/gyroview (MIT). Bundles three.js (MIT, https://github.com/mrdoob/three.js) and
 mediabunny (MPL-2.0, source at https://github.com/Vanilagy/mediabunny). */`;

/**
 * Output options that keep the bundled libraries' own `@license` and `/*!` comments through
 * minification, and put the notice first; set after minification, which would drop it with every
 * other comment.
 */
export const NOTICED_OUTPUT = { postBanner: THIRD_PARTY_NOTICE, comments: { legal: true } };
