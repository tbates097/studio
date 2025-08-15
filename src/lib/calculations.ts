
/**
 * Calculates the orthogonality based on differential measurements from a dual-probe indicator.
 * 
 * The system uses two probes (A and B) spaced 30mm apart on the artifact face.
 * The differential reading = Probe A - Probe B (in microns).
 * 
 * @param differentialReading The differential measurement from the indicator (in microns).
 * @param travelDistance The distance the stage traveled (in mm).
 * @param probeSpacing The spacing between the two probes (in mm). Default is 30mm.
 * @returns An object containing the calculated angle in arcseconds, or null if invalid.
 */
export function calculateOrthogonality(
  differentialReading: number,
  travelDistance: number,
  probeSpacing: number = 30
): { value: number; unit: "arcsec" } | null {
  if (probeSpacing <= 0 || travelDistance <= 0) {
    return null;
  }

  // Convert differential reading from microns to mm
  const deviationInMm = differentialReading / 1000;
  
  // Calculate angle using the relationship between travel distance and probe spacing
  // The angle represents how much the artifact face deviates from being parallel to the axis
  const angleInRadians = (deviationInMm / probeSpacing) * (travelDistance / probeSpacing);
  
  // Convert radians to arcseconds: (radians * 180 / PI) * 3600
  const angleInArcseconds = angleInRadians * (180 / Math.PI) * 3600;
  
  return {
    value: angleInArcseconds,
    unit: "arcsec",
  };
}
