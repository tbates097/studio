/**
 * Calculates the orthogonality based on slope measurement from position/reading pairs.
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