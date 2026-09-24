/**
 * Shared geometry of the glass jar, in viewBox units (300 x 340). The SVG glass and the physics walls both read
 * these numbers so coins can never sit outside the drawn glass.
 */
export const VB_W = 300;
export const VB_H = 340;
export const CX = 150;

/** Outer glass. */
export const RIM = { top: 26, bottom: 46, half: 72 };
export const NECK = { top: 46, bottom: 62, half: 64 };
export const BODY = { top: 118, half: 112, bottom: 324, corner: 40 };

/** Glass thickness: the interior (physics) is the outer shape inset by this. */
export const GLASS = 7;

export const INNER = {
  neckHalf: NECK.half - GLASS,
  bodyHalf: BODY.half - GLASS,
  bottom: BODY.bottom - GLASS,
  corner: BODY.corner - GLASS,
  shoulderTop: NECK.bottom - 2,
  shoulderBottom: BODY.top,
};

/** Interior half width at height y (ignores the rounded bottom, handled as corner circles). */
export function innerHalfWidth(y: number): number {
  if (y <= INNER.shoulderTop) return INNER.neckHalf;
  if (y >= INNER.shoulderBottom) return INNER.bodyHalf;
  const t = (y - INNER.shoulderTop) / (INNER.shoulderBottom - INNER.shoulderTop);
  const s = t * t * (3 - 2 * t);
  return INNER.neckHalf + (INNER.bodyHalf - INNER.neckHalf) * s;
}

/** Outer body path (neck to bottom), open at the mouth. */
export const JAR_BODY_PATH = [
  `M ${CX - NECK.half} ${NECK.top}`,
  `L ${CX - NECK.half} ${NECK.bottom}`,
  `C ${CX - NECK.half} ${NECK.bottom + 30} ${CX - BODY.half} ${NECK.bottom + 22} ${CX - BODY.half} ${BODY.top}`,
  `L ${CX - BODY.half} ${BODY.bottom - BODY.corner}`,
  `Q ${CX - BODY.half} ${BODY.bottom} ${CX - BODY.half + BODY.corner} ${BODY.bottom}`,
  `L ${CX + BODY.half - BODY.corner} ${BODY.bottom}`,
  `Q ${CX + BODY.half} ${BODY.bottom} ${CX + BODY.half} ${BODY.bottom - BODY.corner}`,
  `L ${CX + BODY.half} ${BODY.top}`,
  `C ${CX + BODY.half} ${NECK.bottom + 22} ${CX + NECK.half} ${NECK.bottom + 30} ${CX + NECK.half} ${NECK.bottom}`,
  `L ${CX + NECK.half} ${NECK.top}`,
].join(" ");
