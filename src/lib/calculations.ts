/**
 * Calculates the orthogonality based on slope measurement from two position/reading points.
 * 
 * This calculates the straightness/parallelism error of the artifact face relative to stage travel.
 * The result represents how much the face is tilted and remains constant regardless of carriage position.
 * 
 * @param zeroReading The indicator reading at the zero position (in microns).
 * @param currentReading The current indicator reading (in microns).
 * @param currentPosition The current carriage position (in mm from zero).
 * @returns An object containing the calculated angle in arcseconds, or null if invalid.
 */
export function calculateOrthogonality(
  zeroReading: number,
  currentReading: number,
  currentPosition: number
): { value: number; unit: "arcsec" } | null {
  if (currentPosition <= 0) {
    return null;
  }

  // Calculate slope: change in reading over travel distance
  const deltaReading = currentReading - zeroReading; // in microns
  const slope = deltaReading / currentPosition; // microns per mm
  
  // Convert slope to angle in radians
  // slope is μm/mm = 10^-3 m/m = 10^-3 radians (for small angles)
  const angleInRadians = slope * 1e-3;
  
  // Convert radians to arcseconds: radians * 206265
  const angleInArcseconds = angleInRadians * 206265;
  
  return {
    value: angleInArcseconds,
    unit: "arcsec",
  };
}
/**
 * Calculate orthogonality angle in arcseconds from multiple (position, reading) samples
 * using linear regression.
 *
 * @param zeroPosition Position (mm) where indicator was zeroed
 * @param zeroReading Indicator value (µm) at zeroPosition
 * @param samples Array of { position: mm, reading: µm }
 * @returns { value: number; unit: "arcsec" } | null
 */
export function calculateOrthogonalityFromSamples(
  zeroPosition: number,
  zeroReading: number,
  samples: { position: number; reading: number }[]
): { value: number; unit: "arcsec" } | null {
  if (samples.length < 2) {
    return null; // need at least 2 points for a slope
  }

  // Translate data so zero point is at (0,0)
  const translated = samples.map(s => ({
    x: s.position - zeroPosition, // mm
    y: s.reading - zeroReading,   // µm
  }));

  // Linear regression to get slope (y/x in µm/mm)
  const n = translated.length;
  const sumX = translated.reduce((acc, p) => acc + p.x, 0);
  const sumY = translated.reduce((acc, p) => acc + p.y, 0);
  const sumXY = translated.reduce((acc, p) => acc + p.x * p.y, 0);
  const sumX2 = translated.reduce((acc, p) => acc + p.x * p.x, 0);

  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) {
    return null; // degenerate case (all x the same)
  }

  const slope = (n * sumXY - sumX * sumY) / denominator; // µm/mm

  // Convert slope (µm/mm) → radians
  const angleInRadians = slope * 1e-3;

  // Convert radians → arcseconds
  const angleInArcseconds = angleInRadians * 206265;

  return {
    value: angleInArcseconds,
    unit: "arcsec",
  };
}
