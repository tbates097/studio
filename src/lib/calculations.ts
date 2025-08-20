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

/**
 * Calculates the slope angle from A-B differential measurement across two probes.
 * 
 * This uses the direct differential reading between two probes spaced apart on the artifact face
 * to calculate the real-time slope angle, regardless of absolute probe positions.
 * 
 * @param differentialReading The A-B differential reading (in microns).
 * @param probeSpacing The spacing between probe A and probe B (in mm). Default is 30mm.
 * @returns An object containing the calculated angle in arcseconds, or null if invalid.
 */
export function calculateSlopeFromDifferential(
  differentialReading: number,
  probeSpacing: number = 30
): { value: number; unit: "arcsec" } | null {
  console.log('🔍 calculateSlopeFromDifferential inputs:');
  console.log('🔍 differentialReading:', differentialReading);
  console.log('🔍 probeSpacing:', probeSpacing);
  
  if (probeSpacing <= 0) {
    return null;
  }

  // Calculate slope directly from differential
  const slope = differentialReading / probeSpacing; // μm/mm
  console.log('🔍 slope (μm/mm):', slope);
  
  // Convert slope to angle in radians
  const angleInRadians = slope * 1e-3;
  console.log('🔍 angleInRadians:', angleInRadians);
  
  // Convert radians to arcseconds
  const angleInArcseconds = angleInRadians * 206265;
  console.log('🔍 angleInArcseconds:', angleInArcseconds);
  
  return {
    value: angleInArcseconds,
    unit: "arcsec",
  };
}

/**
 * Calculates slope from two independent probe readings at known positions
 * to determine parallelism relative to stage travel.
 * 
 * @param probeAReading Current reading from Probe A (in microns)
 * @param probeAPosition Position of Probe A relative to zero (in mm)
 * @param probeBReading Current reading from Probe B (in microns)  
 * @param probeBPosition Position of Probe B relative to zero (in mm)
 * @returns Average slope in arcseconds, or null if invalid
 */
export function calculateSlopeFromTwoProbes(
  probeAReading: number,
  probeAPosition: number,
  probeBReading: number,
  probeBPosition: number
): { value: number; unit: "arcsec" } | null {
  console.log('🔍 calculateSlopeFromTwoProbes inputs:');
  console.log('🔍 probeAReading:', probeAReading, 'at position:', probeAPosition);
  console.log('🔍 probeBReading:', probeBReading, 'at position:', probeBPosition);
  
  if (probeAPosition <= 0 || probeBPosition <= 0) {
    console.log('🔍 Invalid positions - must be > 0');
    return null;
  }

  // Calculate slope from each probe relative to stage travel
  const slopeA = probeAReading / probeAPosition; // μm/mm
  const slopeB = probeBReading / probeBPosition; // μm/mm
  
  console.log('🔍 slopeA (μm/mm):', slopeA);
  console.log('🔍 slopeB (μm/mm):', slopeB);
  
  // Average the two slopes for overall face slope relative to stage
  const averageSlope = (slopeA + slopeB) / 2;
  console.log('🔍 averageSlope (μm/mm):', averageSlope);
  
  // Convert slope to angle in radians
  const angleInRadians = averageSlope * 1e-3;
  
  // Convert radians to arcseconds
  const angleInArcseconds = angleInRadians * 206265;
  console.log('🔍 angleInArcseconds:', angleInArcseconds);
  
  return {
    value: angleInArcseconds,
    unit: "arcsec",
  };
}

/**
 * Two-phase orthogonality calculation using independent probe readings
 * Phase 1: Establish initial slope using Probe A + carriage position
 * Phase 2: Use both probes independently for real-time slope calculation
 * 
 * @param phase1ZeroReading Probe A reading when zeroed (Phase 1)
 * @param phase1CurrentReading Current Probe A reading (Phase 1) 
 * @param carriagePosition Current carriage position in mm
 * @param probeAReading Current Probe A reading (Phase 2)
 * @param probeBReading Current Probe B reading (Phase 2)
 * @param probeSpacing Distance between probes A and B in mm (default 30mm)
 * @returns Object with initial slope and current adjusted slope in arcseconds
 */
export function calculateTwoPhaseOrthogonality(
  phase1ZeroReading: number,
  phase1CurrentReading: number,
  carriagePosition: number,
  probeAReading: number,
  probeBReading: number,
  probeSpacing: number = 30
): { 
  initialSlope: { value: number; unit: "arcsec" } | null,
  adjustedSlope: { value: number; unit: "arcsec" } | null 
} {
  // Phase 1: Calculate initial slope from Probe A + position
  const initialSlope = calculateOrthogonality(phase1ZeroReading, phase1CurrentReading, carriagePosition);
  
  // Phase 2: Calculate real-time adjustment from both probes independently
  const probeBPosition = carriagePosition + probeSpacing; // Probe B is probeSpacing mm further
  const adjustedSlope = calculateSlopeFromTwoProbes(probeAReading, carriagePosition, probeBReading, probeBPosition);
  
  return {
    initialSlope,
    adjustedSlope
  };
}
