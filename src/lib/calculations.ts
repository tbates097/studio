
/**
 * Calculates the orthogonality based on two readings over a specified distance.
 *
 * @param reading1 The first measurement from the digital indicator (in microns).
 * @param reading2 The second measurement from the digital indicator (in microns).
 * @param distance The distance over which the measurements were taken (in mm).
 * @returns An object containing the calculated value and its unit ('arcsec' or 'μm'), or null if distance is invalid.
 */
export function calculateOrthogonality(
  reading1: number,
  reading2: number,
  distance: number
): { value: number; unit: "arcsec" | "μm" } | null {
  if (distance <= 0) {
    return null;
  }

  // The deviation is the difference between the two readings.
  // We divide by 1000 to convert microns to mm to match the distance unit.
  const deviation = (reading2 - reading1) / 1000;

  if (distance >= 150) {
    // For distances >= 150mm, calculate in arcseconds.
    // tan(angle) = opposite / adjacent = deviation / distance
    const angleInRadians = Math.atan(deviation / distance);
    // Convert radians to arcseconds: (radians * 180 / PI) * 3600
    const angleInArcseconds = angleInRadians * (180 / Math.PI) * 3600;
    return {
      value: angleInArcseconds,
      unit: "arcsec",
    };
  } else {
    // For distances < 150mm, the result is the linear deviation in microns.
    const deviationInMicrons = reading2 - reading1;
    return {
      value: deviationInMicrons,
      unit: "μm",
    };
  }
}
