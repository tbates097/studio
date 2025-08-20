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
