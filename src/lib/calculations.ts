// ===== THREE-PHASE METROLOGY WORKFLOW CALCULATIONS =====

/**
 * Phase 1: Calculate initial angular error from two position measurements
 * θ_initial = arctan((A2_initial - A1_initial) / L)
 * 
 * @param A1_initial Reading at position X1 (typically 0mm) in microns
 * @param A2_initial Reading at position X2 (measurement distance) in microns  
 * @param measurementDistance Distance between X1 and X2 in mm
 * @returns Initial angle error in arcseconds, or null if invalid
 */
export function calculateInitialAngle(
  A1_initial: number,
  A2_initial: number,
  measurementDistance: number
): { value: number; unit: "arcsec" } | null {
  if (measurementDistance <= 0) {
    return null;
  }

  // Calculate angle using arctan
  const deltaReading = A2_initial - A1_initial; // microns
  const slope = deltaReading / measurementDistance; // μm/mm
  const angleInRadians = Math.atan(slope * 1e-3); // Convert μm/mm to radians
  const angleInArcseconds = angleInRadians * 206265; // Convert radians to arcseconds
  
  return {
    value: angleInArcseconds,
    unit: "arcsec"
  };
}

/**
 * Phase 2: Calculate lever arm distance from test adjustment
 * LeverArm_X2 = ΔA2_test / tan(Δθ_test)
 * 
 * @param A1_initial Initial reading at X1 in microns
 * @param A2_initial Initial reading at X2 in microns
 * @param A1_test Reading at X1 after test adjustment in microns
 * @param A2_test Reading at X2 after test adjustment in microns
 * @param measurementDistance Distance between X1 and X2 in mm
 * @returns Object with lever arm distance and intermediate calculations, or null if invalid
 */
export function calculateLeverArm(
  A1_initial: number,
  A2_initial: number,
  A1_test: number,
  A2_test: number,
  measurementDistance: number
): { 
  leverArm: number;
  theta_initial: number;
  theta_after_test: number;
  delta_theta: number;
  unit: "mm"
} | null {
  if (measurementDistance <= 0) {
    return null;
  }

  // Calculate initial angle
  const theta_initial_rad = Math.atan((A2_initial - A1_initial) / measurementDistance * 1e-3);
  const theta_initial = theta_initial_rad * 206265; // arcseconds

  // Calculate angle after test adjustment
  const theta_after_test_rad = Math.atan((A2_test - A1_test) / measurementDistance * 1e-3);
  const theta_after_test = theta_after_test_rad * 206265; // arcseconds

  // Calculate change in angle
  const delta_theta_rad = theta_after_test_rad - theta_initial_rad;
  const delta_theta = theta_after_test - theta_initial; // arcseconds

  // Prevent division by zero
  if (Math.abs(delta_theta_rad) < 1e-10) {
    return null; // No meaningful adjustment detected
  }

  // Calculate vertical change at X2
  const deltaA2_test = A2_test - A2_initial; // microns

  // Calculate lever arm: LeverArm = ΔA2_test / tan(Δθ_test)
  const leverArm = Math.abs(deltaA2_test) / Math.abs(Math.tan(delta_theta_rad)) * 1e-3; // Convert to mm

  return {
    leverArm,
    theta_initial,
    theta_after_test,
    delta_theta,
    unit: "mm"
  };
}

/**
 * Phase 3: Calculate target reading for final correction
 * Target_A2 = A2_test + LeverArm_X2 * tan(-θ_after_test)
 * 
 * @param A2_test Reading at X2 after test adjustment in microns
 * @param leverArm Lever arm distance in mm (from Phase 2)
 * @param theta_after_test Angle after test adjustment in arcseconds
 * @returns Target reading in microns for zero error, or null if invalid
 */
export function calculateTargetReading(
  A2_test: number,
  leverArm: number,
  theta_after_test: number
): { target: number; correction: number; unit: "μm" } | null {
  if (leverArm <= 0) {
    return null;
  }

  // Convert angle to radians
  const theta_after_test_rad = theta_after_test / 206265;

  // Calculate required vertical change to bring angle to zero
  const deltaA2_final = leverArm * Math.tan(-theta_after_test_rad) * 1000; // Convert mm to microns

  // Calculate target reading
  const target = A2_test + deltaA2_final;

  return {
    target,
    correction: deltaA2_final,
    unit: "μm"
  };
}

/**
 * Utility function to check if current reading is within tolerance of target
 * 
 * @param currentReading Current indicator reading in microns
 * @param targetReading Target reading in microns
 * @param tolerance Acceptable tolerance in microns (default: 2μm)
 * @returns Object with success status, error, and progress percentage
 */
export function checkTargetProgress(
  currentReading: number,
  targetReading: number,
  tolerance: number = 2
): {
  isWithinTolerance: boolean;
  error: number;
  progress: number;
  unit: "μm"
} {
  const error = Math.abs(currentReading - targetReading);
  const isWithinTolerance = error <= tolerance;
  
  // Calculate progress as percentage (100% when error is 0, 0% when error is very large)
  const maxError = 50; // Consider 50μm as 0% progress
  const progress = Math.max(0, Math.min(100, (1 - error / maxError) * 100));

  return {
    isWithinTolerance,
    error,
    progress,
    unit: "μm"
  };
}

// ===== BEST-FIT LINE AND COMPENSATED ORTHOGONALITY CALCULATIONS =====

/**
 * Measurement data point structure
 */
export interface MeasurementPoint {
  position: number; // mm
  reading: number;  // μm
}

/**
 * Calculate best-fit line through measurement points using least squares method
 * 
 * @param measurements Array of measurement points
 * @returns Object with slope (μm/mm), intercept (μm), and correlation coefficient, or null if invalid
 */
export function calculateBestFitLine(
  measurements: MeasurementPoint[]
): {
  slope: number;        // μm/mm
  intercept: number;    // μm
  rSquared: number;     // correlation coefficient (0-1)
  slopeArcsec: number;  // slope converted to arcseconds
  unit: "arcsec"
} | null {
  if (!measurements || measurements.length < 2) {
    return null;
  }

  const n = measurements.length;
  
  // Calculate sums for least squares method
  let sumX = 0;      // sum of positions
  let sumY = 0;      // sum of readings  
  let sumXY = 0;     // sum of position × reading
  let sumXX = 0;     // sum of position²
  let sumYY = 0;     // sum of reading²

  for (const point of measurements) {
    sumX += point.position;
    sumY += point.reading;
    sumXY += point.position * point.reading;
    sumXX += point.position * point.position;
    sumYY += point.reading * point.reading;
  }

  // Calculate slope and intercept using least squares formulas
  const denominator = n * sumXX - sumX * sumX;
  if (Math.abs(denominator) < 1e-10) {
    return null; // Avoid division by zero
  }

  const slope = (n * sumXY - sumX * sumY) / denominator;           // μm/mm
  const intercept = (sumY - slope * sumX) / n;                     // μm

  // Calculate R-squared (coefficient of determination)
  const meanY = sumY / n;
  let ssRes = 0; // sum of squares of residuals
  let ssTot = 0; // total sum of squares

  for (const point of measurements) {
    const predicted = slope * point.position + intercept;
    ssRes += Math.pow(point.reading - predicted, 2);
    ssTot += Math.pow(point.reading - meanY, 2);
  }

  const rSquared = ssTot > 0 ? 1 - (ssRes / ssTot) : 1;

  // Convert slope to arcseconds
  // slope is in μm/mm, convert to radians then arcseconds
  const slopeArcsec = Math.atan(slope * 1e-3) * 206265;

  return {
    slope,
    intercept,
    rSquared: Math.max(0, Math.min(1, rSquared)), // Clamp between 0 and 1
    slopeArcsec,
    unit: "arcsec"
  };
}

/**
 * Calculate compensated orthogonality by removing artifact alignment error
 * 
 * @param referenceMeasurements Step 3 measurements (artifact reference face)
 * @param finalMeasurements Step 5 measurements (perpendicular face)
 * @returns Compensated orthogonality result with artifact error removed, or null if invalid
 */
export function calculateCompensatedOrthogonality(
  referenceMeasurements: MeasurementPoint[],
  finalMeasurements: MeasurementPoint[]
): {
  compensatedOrthogonality: number;  // arcseconds
  rawOrthogonality: number;          // arcseconds  
  artifactError: number;             // arcseconds
  referenceFit: {
    slope: number;
    slopeArcsec: number;
    rSquared: number;
  };
  finalFit: {
    slope: number;
    slopeArcsec: number;
    rSquared: number;
  };
  unit: "arcsec"
} | null {
  // Calculate best-fit lines for both measurement sets
  const referenceFit = calculateBestFitLine(referenceMeasurements);
  const finalFit = calculateBestFitLine(finalMeasurements);

  if (!referenceFit || !finalFit) {
    return null;
  }

  // Raw orthogonality = slope of perpendicular face measurements
  const rawOrthogonality = finalFit.slopeArcsec;

  // Artifact error = slope of reference face measurements  
  const artifactError = referenceFit.slopeArcsec;

  // Compensated orthogonality = raw - artifact error
  // This removes the artifact misalignment from the measurement
  const compensatedOrthogonality = rawOrthogonality - artifactError;

  return {
    compensatedOrthogonality,
    rawOrthogonality,
    artifactError,
    referenceFit: {
      slope: referenceFit.slope,
      slopeArcsec: referenceFit.slopeArcsec,
      rSquared: referenceFit.rSquared
    },
    finalFit: {
      slope: finalFit.slope,
      slopeArcsec: finalFit.slopeArcsec,
      rSquared: finalFit.rSquared
    },
    unit: "arcsec"
  };
}

/**
 * Calculate live adjustment tolerance based on alignment part number and measurement distance
 * 
 * @param alignmentPartNumber PA5 or PA10 specification
 * @param measurementDistance Distance in mm
 * @returns Tolerance in microns for live adjustment feedback
 */
export function calculateAdjustmentTolerance(
  alignmentPartNumber: string,
  measurementDistance: number
): number {
  const isPa5 = alignmentPartNumber.toUpperCase().includes("PA5");
  const isPa10 = alignmentPartNumber.toUpperCase().includes("PA10");
  
  if (measurementDistance < 150) {
    // Use micron tolerances for short distances
    if (isPa5) return 3; // 3 microns for PA5
    if (isPa10) return 7; // 7 microns for PA10
    return 5; // Default fallback
  } else {
    // Convert arcsecond specs to microns for the given distance
    // tolerance_microns = tan(tolerance_arcsec * π/180 / 3600) * distance_mm * 1000
    const arcsecTolerance = isPa5 ? 5 : isPa10 ? 10 : 5; // Default to PA5
    const radians = (arcsecTolerance * Math.PI) / (180 * 3600);
    const toleranceMicrons = Math.tan(radians) * measurementDistance * 1000;
    return toleranceMicrons;
  }
}
