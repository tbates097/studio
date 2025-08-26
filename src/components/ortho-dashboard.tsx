"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Link,
  Unlink,
  Calculator,
  FileText,
  Zap,
  RotateCcw,
  Check,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { 
  calculateInitialAngle,
  calculateLeverArm,
  calculateTargetReading,
  checkTargetProgress,
  calculateCompensatedOrthogonality,
  calculateAdjustmentTolerance,
  type MeasurementPoint
} from "@/lib/calculations";
import { useToast } from "@/hooks/use-toast";
import { Logo } from "./icons/logo";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useIndicator } from "@/hooks/use-indicator";
import { Badge } from "./ui/badge";


type Step = "setup" | "squaring" | "referenceMeasurement" | "adjustment" | "finalMeasurement" | "results";

type Measurement = {
  position: number;
  reading: number;
};

type OrthogonalityResult = {
  value: number;
  unit: "arcsec";
} | null;

type ReportData = {
  technician: string;
  axis1Serial: string;
  axis2Serial: string;
  orderNumber: string;
  customerName: string;
  alignmentPartNumber: string;
  artifactAssetNumber: string;
  indicatorAssetNumber: string;
  comments: string;
};

const SPEC_ARCSECONDS = 5;

export function OrthoDashboard() {
  const [step, setStep] = useState<Step>("setup");
  const [measurementDistance, setMeasurementDistance] = useState("100");
  const { 
    reading: currentReading, 
    currentReadingRef,
    connect, 
    disconnect,
    sendCommand,
    connectionStatus,
    isSimulation,
    setSimulationReading,
  } = useIndicator();
  const [squaringMeasurements, setSquaringMeasurements] = useState<Measurement[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [finalResult, setFinalResult] = useState<OrthogonalityResult>(null);
  const [detailedResults, setDetailedResults] = useState<{
    compensatedOrthogonality: number;
    rawOrthogonality: number;
    artifactError: number;
    referenceFit: { slope: number; slopeArcsec: number; rSquared: number; };
    finalFit: { slope: number; slopeArcsec: number; rSquared: number; };
    unit: "arcsec";
  } | null>(null);
  const [squaringZero, setSquaringZero] = useState<number | null>(null);
  const [squaringResult, setSquaringResult] = useState<OrthogonalityResult>(null);
  const [adjustmentZero, setAdjustmentZero] = useState<number | null>(null);
  
  // Three-Phase Workflow State
  const [currentPhase, setCurrentPhase] = useState<1 | 2 | 3>(1);
  
  // Phase 1: Measure Initial Angular Error
  const [A1_initial, setA1_initial] = useState<number | null>(null);
  const [A2_initial, setA2_initial] = useState<number | null>(null);
  const [theta_initial, setTheta_initial] = useState<{ value: number; unit: "arcsec" } | null>(null);
  
  // Phase 2: Calibrate Adjustment (Find Pivot)
  const [A1_test, setA1_test] = useState<number | null>(null);
  const [A2_test, setA2_test] = useState<number | null>(null);
  const [leverArmResult, setLeverArmResult] = useState<{ leverArm: number; theta_initial: number; theta_after_test: number; delta_theta: number; unit: "mm" } | null>(null);
  
  // Calibration History & Confidence Tracking
  const [calibrationHistory, setCalibrationHistory] = useState<Array<{
    leverArm: number;
    timestamp: number;
    A1_test: number;
    A2_test: number;
    theta_after_test: number;
  }>>([]);
  const [pivotConfidence, setPivotConfidence] = useState<{
    level: "high" | "medium" | "low" | "unknown";
    variation: number;
    message: string;
  }>({ level: "unknown", variation: 0, message: "No calibration data yet" });

  // Phase 3: Execute Final Correction
  const [targetResult, setTargetResult] = useState<{ target: number; correction: number; unit: "μm" } | null>(null);
  const [targetProgress, setTargetProgress] = useState<{ isWithinTolerance: boolean; error: number; progress: number; unit: "μm" } | null>(null);

  // Upper Axis Three-Phase Workflow State (Step 4)
  const [upperCurrentPhase, setUpperCurrentPhase] = useState<1 | 2 | 3>(1);
  
  // Upper Phase 1: Measure Initial Angular Error
  const [upperA1_initial, setUpperA1_initial] = useState<number | null>(null);
  const [upperA2_initial, setUpperA2_initial] = useState<number | null>(null);
  const [upperTheta_initial, setUpperTheta_initial] = useState<{ value: number; unit: "arcsec" } | null>(null);
  
  // Upper Phase 2: Calibrate Adjustment (Find Pivot)
  const [upperA1_test, setUpperA1_test] = useState<number | null>(null);
  const [upperA2_test, setUpperA2_test] = useState<number | null>(null);
  const [upperLeverArmResult, setUpperLeverArmResult] = useState<{ leverArm: number; theta_initial: number; theta_after_test: number; delta_theta: number; unit: "mm" } | null>(null);
  
  // Upper Calibration History & Confidence Tracking
  const [upperCalibrationHistory, setUpperCalibrationHistory] = useState<Array<{
    leverArm: number;
    timestamp: number;
    A1_test: number;
    A2_test: number;
    theta_after_test: number;
  }>>([]);
  const [upperPivotConfidence, setUpperPivotConfidence] = useState<{
    level: "high" | "medium" | "low" | "unknown";
    variation: number;
    message: string;
  }>({ level: "unknown", variation: 0, message: "No calibration data yet" });

  // Upper Phase 3: Execute Final Correction
  const [upperTargetResult, setUpperTargetResult] = useState<{ target: number; correction: number; unit: "μm" } | null>(null);
  const [upperTargetProgress, setUpperTargetProgress] = useState<{ isWithinTolerance: boolean; error: number; progress: number; unit: "μm" } | null>(null);

  const [reportData, setReportData] = useState<ReportData>({
    technician: "Enter Name",
    axis1Serial: "100000-1-1-X",
    axis2Serial: "100000-1-1-Y",
    orderNumber: "100000",
    customerName: "Plant & Mill - Singapore",
    alignmentPartNumber: "PA5",
    artifactAssetNumber: "0346",
    indicatorAssetNumber: "05614",
    comments: "No issues to report. System meets all specifications.",
  });

  const { toast } = useToast();

  const isConnected = connectionStatus === 'connected';

  const resetProcess = () => {
    setStep("setup");
    setSquaringMeasurements([]);
    setMeasurements([]);
    setFinalResult(null);
    setDetailedResults(null);
    setAdjustmentZero(null);
    setSquaringZero(null);
    setSquaringResult(null);
    
    // Reset three-phase workflow state
    setCurrentPhase(1);
    setA1_initial(null);
    setA2_initial(null);
    setTheta_initial(null);
    setA1_test(null);
    setA2_test(null);
    setLeverArmResult(null);
    setTargetResult(null);
    setTargetProgress(null);
    setCalibrationHistory([]);
    setPivotConfidence({ level: "unknown", variation: 0, message: "No calibration data yet" });
    
    // Reset upper axis three-phase workflow state
    setUpperCurrentPhase(1);
    setUpperA1_initial(null);
    setUpperA2_initial(null);
    setUpperTheta_initial(null);
    setUpperA1_test(null);
    setUpperA2_test(null);
    setUpperLeverArmResult(null);
    setUpperTargetResult(null);
    setUpperTargetProgress(null);
    setUpperCalibrationHistory([]);
    setUpperPivotConfidence({ level: "unknown", variation: 0, message: "No calibration data yet" });
    
    if(isConnected) {
      disconnect();
    }
  };

  const handleReportDataChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target;
    setReportData((prev: ReportData) => ({ ...prev, [id]: value }));
  };

  const handleNextStep = () => {
    if (step === "setup") {
        const distance = parseFloat(measurementDistance);
        if (isNaN(distance) || distance <= 0) {
            toast({
                title: "Invalid Distance",
                description: "Please enter a valid travel distance.",
                variant: "destructive",
            });
            return;
        }
        setStep("squaring");
    } else if (step === "squaring") {
        setStep("referenceMeasurement");
    } else if (step === "referenceMeasurement") {
        // For live adjustment workflow, we don't need multi-point measurements
        // The live feedback is handled by the liveSquaringOrthogonality calculation
        setStep("adjustment");
    } else if (step === "adjustment") {
        setAdjustmentZero(null); // Reset zero for measurement step
        setMeasurements([]);
        setStep("finalMeasurement");
    } else if (step === "finalMeasurement") {
        // Calculate final compensated orthogonality from Step 3 and Step 5 measurements
        if (squaringMeasurements.length >= 2 && measurements.length >= 2) {
            const result = calculateCompensatedOrthogonality(squaringMeasurements, measurements);
            if (result) {
                 setFinalResult({
                    value: result.compensatedOrthogonality,
                    unit: "arcsec"
                });
                setDetailedResults(result);
            }
        }
        setStep("results");
    }
  };
  
  const handlePrevStep = () => {
    if (step === "squaring") {
      setSquaringZero(null);
      setStep("setup");
    }
    if (step === "referenceMeasurement") {
      setSquaringMeasurements([]);
      setStep("squaring");
    }
    if (step === "adjustment") {
      setSquaringResult(null);
      setStep("referenceMeasurement");
    }
    if (step === "finalMeasurement") {
        setMeasurements([]);
        setAdjustmentZero(null);
        setStep("adjustment");
    }
    if (step === "results") setStep("finalMeasurement");
  };

  const recordSquaringMeasurement = () => {
    const distance = parseFloat(measurementDistance);
    const numMeasurements = distance > 200 ? Math.floor(distance / 100) + 1 : 2;
    
    if(squaringMeasurements.length < numMeasurements) {
        let position = 0;
        if (squaringMeasurements.length > 0) {
            position = distance > 200 ? squaringMeasurements.length * 100 : distance;
        }
        setSquaringMeasurements((prev: Measurement[]) => [...prev, { position, reading: currentReading }]);
    }
  };

  const recordMeasurement = () => {
    const distance = parseFloat(measurementDistance);
    const numMeasurements = distance > 200 ? Math.floor(distance / 100) + 1 : 2;
    
    if(measurements.length < numMeasurements) {
        let position = 0;
        if (measurements.length > 0) {
            position = distance > 200 ? measurements.length * 100 : distance;
        }
        setMeasurements((prev: Measurement[]) => [...prev, { position, reading: currentReading }]);
    }
  };

  const handlePrint = () => window.print();

  // Update target progress in Phase 3
  useEffect(() => {
    if (currentPhase === 3 && targetResult && currentReading !== null) {
      const progress = checkTargetProgress(currentReading, targetResult.target);
      setTargetProgress(progress);
    } else {
      setTargetProgress(null);
    }
  }, [currentPhase, targetResult, currentReading]);

  // Calculate confidence based on calibration history
  const calculateConfidence = useCallback((history: Array<{leverArm: number}>) => {
    if (history.length < 2) return { level: "unknown" as const, variation: 0, message: "Need more calibrations for confidence assessment" };
    
    const leverArms = history.map(h => h.leverArm);
    const avg = leverArms.reduce((sum, val) => sum + val, 0) / leverArms.length;
    const variance = leverArms.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / leverArms.length;
    const stdDev = Math.sqrt(variance);
    const variation = (stdDev / avg) * 100; // Percentage variation
    
    if (variation < 5) return { level: "high" as const, variation, message: "Pivot point very stable - high confidence" };
    if (variation < 15) return { level: "medium" as const, variation, message: "Pivot point moderately stable - reasonable confidence" };
    return { level: "low" as const, variation, message: "Pivot point varies significantly - consider mechanical adjustment" };
  }, []);

  // Update confidence when calibration history changes
  useEffect(() => {
    console.log('Calibration history changed:', calibrationHistory);
    const newConfidence = calculateConfidence(calibrationHistory);
    console.log('New confidence:', newConfidence);
    setPivotConfidence(newConfidence);
  }, [calibrationHistory, calculateConfidence]);

  // Update upper axis confidence when calibration history changes
  useEffect(() => {
    console.log('Upper calibration history changed:', upperCalibrationHistory);
    const newConfidence = calculateConfidence(upperCalibrationHistory);
    console.log('New upper confidence:', newConfidence);
    setUpperPivotConfidence(newConfidence);
  }, [upperCalibrationHistory, calculateConfidence]);

  // Update upper axis target progress in Phase 3
  useEffect(() => {
    if (upperCurrentPhase === 3 && upperTargetResult && currentReading !== null) {
      // Calculate dynamic tolerance based on PA5/PA10 spec and measurement distance
      const tolerance = calculateAdjustmentTolerance(reportData.alignmentPartNumber, parseFloat(measurementDistance));
      const progress = checkTargetProgress(currentReading, upperTargetResult.target, tolerance);
      setUpperTargetProgress(progress);
    } else {
      setUpperTargetProgress(null);
    }
  }, [upperCurrentPhase, upperTargetResult, currentReading, reportData.alignmentPartNumber, measurementDistance]);



  const renderStepContent = () => {
    const distance = parseFloat(measurementDistance) || 0;
    const numMeasurements = distance > 200 ? Math.floor(distance / 100) + 1 : 2;

    switch (step) {
      case "setup":
        return (
          <Card>
            <CardHeader>
              <CardTitle>Step 1: Setup</CardTitle>
              <CardDescription>
                Connect to the indicator and enter test details. Default values
                are for demonstration.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button onClick={isConnected ? disconnect : connect} className="w-full">
                {connectionStatus === "connecting" ? (
                  "Connecting..."
                ) : isConnected ? (
                  <>
                    <Unlink />
                    Disconnect Indicator
                  </>
                ) : (
                  <>
                    <Link />
                    Connect to Indicator
                  </>
                )}
              </Button>



              <Accordion type="multiple" defaultValue={["item-1"]} className="w-full">
                <AccordionItem value="item-1">
                  <AccordionTrigger>Test Parameters</AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2">
                      <Label htmlFor="measurementDistance">Measurement Distance (mm)</Label>
                      <Input
                        id="measurementDistance"
                        type="number"
                        value={measurementDistance}
                        onChange={(e) => setMeasurementDistance(e.target.value)}
                      />
                    </div>

                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-2">
                  <AccordionTrigger>Report Information</AccordionTrigger>
                  <AccordionContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="technician">Technician</Label>
                        <Input
                          id="technician"
                          value={reportData.technician}
                          onChange={handleReportDataChange}
                        />
                      </div>
                       <div className="space-y-2">
                        <Label htmlFor="customerName">Customer Name</Label>
                        <Input
                          id="customerName"
                          value={reportData.customerName}
                          onChange={handleReportDataChange}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="orderNumber">Order Number</Label>
                        <Input
                          id="orderNumber"
                          value={reportData.orderNumber}
                          onChange={handleReportDataChange}
                        />
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
                 <AccordionItem value="item-3">
                  <AccordionTrigger>Stage Information</AccordionTrigger>
                  <AccordionContent>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                       <div className="space-y-2">
                        <Label htmlFor="axis1Serial">Axis 1 Serial Number</Label>
                        <Input
                          id="axis1Serial"
                          value={reportData.axis1Serial}
                          onChange={handleReportDataChange}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="axis2Serial">Axis 2 Serial Number</Label>
                        <Input
                          id="axis2Serial"
                          value={reportData.axis2Serial}
                          onChange={handleReportDataChange}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="alignmentPartNumber">
                          Alignment Part Number
                        </Label>
                        <Input
                          id="alignmentPartNumber"
                          value={reportData.alignmentPartNumber}
                          onChange={handleReportDataChange}
                        />
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-4">
                  <AccordionTrigger>Asset Information</AccordionTrigger>
                  <AccordionContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="artifactAssetNumber">
                          Artifact Asset Number
                        </Label>
                        <Input
                          id="artifactAssetNumber"
                          value={reportData.artifactAssetNumber}
                          onChange={handleReportDataChange}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="indicatorAssetNumber">
                          Indicator Asset Number
                        </Label>
                        <Input
                          id="indicatorAssetNumber"
                          value={reportData.indicatorAssetNumber}
                          onChange={handleReportDataChange}
                        />
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
            <CardFooter className="justify-end">
              <Button onClick={handleNextStep} disabled={!isConnected}>
                Next <ChevronRight />
              </Button>
            </CardFooter>
          </Card>
        );

      case "squaring": {
        const isCompleted = targetProgress?.isWithinTolerance || false;
        
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Step 2: Artifact Adjustment (Three-Phase Method)</CardTitle>
                    <CardDescription>
                        Systematic metrology workflow: Measure initial error → Calibrate adjustment → Execute calculated correction
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
              {/* Live Indicator Reading */}
              <Card>
                <CardHeader>
                  <CardTitle as="h3" className="text-base">Current Indicator Reading</CardTitle>
                  <CardDescription className="text-xs">Live reading from Probe A</CardDescription>
                </CardHeader>
                <CardContent>
                     <LiveReadingCard 
                    reading={currentReading}
                       isConnected={isConnected} 
                    label="Live Reading"
                  />
                </CardContent>
              </Card>

              {/* Phase 1: Measure Initial Angular Error */}
              <Card>
                <CardHeader>
                  <CardTitle as="h3" className="text-base">
                    Phase 1: Measure Initial Angular Error 
                    <Badge className="ml-2">
                      {currentPhase === 1 ? "Active" : currentPhase > 1 ? "Complete" : "Pending"}
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Record readings at 0mm and {measurementDistance}mm to calculate initial error angle
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Reading at 0mm (A1)</Label>
                      <div className="p-3 border rounded bg-muted/50 text-center">
                        <p className="text-lg font-semibold">
                          {A1_initial !== null ? A1_initial.toFixed(3) : "---"} μm
                        </p>
                      </div>
                      <Button
                        onClick={() => {
                          sendCommand("FNC 1\r");
                          setTimeout(() => setA1_initial(currentReadingRef.current), 300);
                        }}
                        disabled={!isConnected || currentPhase !== 1}
                        size="sm"
                        className="w-full"
                      >
                        Record A1
                      </Button>
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Reading at {measurementDistance}mm (A2)</Label>
                      <div className="p-3 border rounded bg-muted/50 text-center">
                        <p className="text-lg font-semibold">
                          {A2_initial !== null ? A2_initial.toFixed(3) : "---"} μm
                        </p>
                      </div>
                      <Button
                        onClick={() => {
                          sendCommand("FNC 1\r");
                          setTimeout(() => {
                            const reading = currentReadingRef.current;
                            setA2_initial(reading);
                            if (A1_initial !== null && reading !== null) {
                              const result = calculateInitialAngle(A1_initial, reading, parseFloat(measurementDistance));
                              setTheta_initial(result);
                            }
                          }, 300);
                        }}
                        disabled={!isConnected || currentPhase !== 1 || A1_initial === null}
                        size="sm"
                        className="w-full"
                      >
                        Record A2
                      </Button>
                    </div>
                  </div>
                  
                  {theta_initial && (
                    <div className="p-3 border rounded bg-blue-50 text-center">
                      <p className="text-sm font-semibold text-blue-700">
                        ✓ Initial Error: {theta_initial.value.toFixed(2)} arcseconds
                      </p>
                    </div>
                  )}
                  
                  {theta_initial && currentPhase === 1 && (
                    <Button
                      onClick={() => setCurrentPhase(2)}
                      className="w-full"
                    >
                      Next Phase →
                    </Button>
                  )}
                </CardContent>
              </Card>

              {/* Phase 2: Calibrate Adjustment (Find Pivot) */}
              {currentPhase >= 2 && (
                        <Card>
                        <CardHeader>
                    <CardTitle as="h3" className="text-base">
                      Phase 2: Calibrate Adjustment (Find Pivot)
                      <Badge className="ml-2">
                        {currentPhase === 2 ? "Active" : currentPhase > 2 ? "Complete" : "Pending"}
                      </Badge>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Make test adjustment to learn your setup's geometry. Re-record values after large adjustments to check if pivot point changed.
                    </CardDescription>
                        </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      1. At {measurementDistance}mm position, make a deliberate angular adjustment<br/>
                      2. Record new reading at {measurementDistance}mm<br/>
                      3. Move back to 0mm and record reading<br/>
                      4. Calculate lever arm distance
                    </p>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Test reading at {measurementDistance}mm</Label>
                        <div className="p-3 border rounded bg-muted/50 text-center">
                          <p className="text-lg font-semibold">
                            {A2_test !== null ? A2_test.toFixed(3) : "---"} μm
                          </p>
                        </div>
                        <Button
                          onClick={() => {
                            sendCommand("FNC 1\r");
                            setTimeout(() => setA2_test(currentReadingRef.current), 300);
                          }}
                          disabled={!isConnected || currentPhase < 2}
                          size="sm"
                          className="w-full"
                        >
                          Record A2_test
                        </Button>
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Test reading at 0mm</Label>
                        <div className="p-3 border rounded bg-muted/50 text-center">
                          <p className="text-lg font-semibold">
                            {A1_test !== null ? A1_test.toFixed(3) : "---"} μm
                          </p>
                        </div>
                        <Button
                          onClick={() => {
                            sendCommand("FNC 1\r");
                            setTimeout(() => {
                              const reading = currentReadingRef.current;
                              setA1_test(reading);
                              if (A1_initial !== null && A2_initial !== null && A2_test !== null && reading !== null) {
                                const result = calculateLeverArm(A1_initial, A2_initial, reading, A2_test, parseFloat(measurementDistance));
                                setLeverArmResult(result);
                                if (result && A2_test !== null) {
                                  const targetCalc = calculateTargetReading(A2_test, result.leverArm, result.theta_after_test);
                                  setTargetResult(targetCalc);
                                  
                                  // Add to calibration history
                                  const newCalibration = {
                                    leverArm: result.leverArm,
                                    timestamp: Date.now(),
                                    A1_test: reading,
                                    A2_test: A2_test,
                                    theta_after_test: result.theta_after_test
                                  };
                                  console.log('Adding calibration to history:', newCalibration);
                                  setCalibrationHistory(prev => {
                                    const newHistory = [...prev, newCalibration];
                                    console.log('New calibration history:', newHistory);
                                    return newHistory;
                                  });
                                }
                              }
                            }, 300);
                          }}
                          disabled={!isConnected || currentPhase < 2 || A2_test === null}
                          size="sm"
                          className="w-full"
                        >
                          Record A1_test
                        </Button>
                      </div>
                    </div>
                    
                    {leverArmResult && (
                      <div className="p-3 border rounded bg-green-50 space-y-1">
                        <p className="text-sm font-semibold text-green-700">✓ Calibration Complete:</p>
                        <p className="text-xs text-green-600">Lever Arm: {leverArmResult.leverArm.toFixed(1)} mm</p>
                        <p className="text-xs text-green-600">Angle after test: {leverArmResult.theta_after_test.toFixed(2)} arcsec</p>
                      </div>
                    )}
                    
                    {/* Debug Info */}
                    <div className="p-2 border rounded bg-gray-100 text-gray-800 text-xs font-mono">
                      <p><strong>Debug Info:</strong></p>
                      <p>History Count: {calibrationHistory.length}</p>
                      <p>Confidence: {pivotConfidence.level} (±{pivotConfidence.variation.toFixed(1)}%)</p>
                      <p>Lever Arms: [{calibrationHistory.map(h => h.leverArm.toFixed(1)).join(', ')}]</p>
                      {calibrationHistory.length >= 2 && (
                        <p>Variation: {((Math.sqrt(calibrationHistory.map(h => h.leverArm).reduce((sum, val, _, arr) => {
                          const avg = arr.reduce((s, v) => s + v, 0) / arr.length;
                          return sum + Math.pow(val - avg, 2);
                        }, 0) / calibrationHistory.length) / (calibrationHistory.map(h => h.leverArm).reduce((s, v) => s + v, 0) / calibrationHistory.length)) * 100).toFixed(1)}%</p>
                      )}
                    </div>
                    
                    {/* Confidence Display */}
                    {pivotConfidence.level !== "unknown" && (
                      <div className={`p-3 border-2 rounded space-y-1 ${
                        pivotConfidence.level === "high" ? "bg-green-100 border-green-400 text-green-800" :
                        pivotConfidence.level === "medium" ? "bg-yellow-100 border-yellow-400 text-yellow-800" : 
                        "bg-red-100 border-red-400 text-red-800"
                      }`}>
                        <div className="flex justify-between items-center">
                          <p className="text-sm font-semibold">Pivot Confidence: {pivotConfidence.level.toUpperCase()}</p>
                          <span className="text-xs">±{pivotConfidence.variation.toFixed(1)}%</span>
                        </div>
                        <p className="text-xs">{pivotConfidence.message}</p>
                        <p className="text-xs">Calibrations: {calibrationHistory.length}</p>
                      </div>
                    )}
                    
                    {leverArmResult && currentPhase === 2 && (
                      <Button
                        onClick={() => setCurrentPhase(3)}
                        className="w-full"
                      >
                        Next Phase →
                      </Button>
                    )}
                        </CardContent>
                        </Card>
                    )}

              {/* Phase 3: Execute Final Correction */}
              {currentPhase >= 3 && targetResult && (
                <Card>
                  <CardHeader>
                    <CardTitle as="h3" className="text-base">
                      Phase 3: Execute Final Correction
                      <Badge className="ml-2">Active</Badge>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Adjust artifact until reading matches calculated target
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Move carriage to {measurementDistance}mm and adjust artifact until target reached
                    </p>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center">
                        <Label>Current Reading</Label>
                        <div className="text-2xl font-bold text-blue-600">
                          {currentReading?.toFixed(3)} μm
                        </div>
                      </div>
                      <div className="text-center">
                        <Label>Target Reading</Label>
                        <div className="text-2xl font-bold text-green-600">
                          {targetResult.target.toFixed(3)} μm
                        </div>
                      </div>
                    </div>
                    
                    {targetProgress && (
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Progress to Target</span>
                          <span>Error: {targetProgress.error.toFixed(1)} μm</span>
                        </div>
                        <Progress value={targetProgress.progress} className="h-2" />
                        
                        {targetProgress.isWithinTolerance ? (
                          <div className="p-3 border rounded bg-green-50 text-center">
                            <p className="text-sm font-semibold text-green-700">
                              🎯 Target Achieved! Artifact aligned within tolerance.
                            </p>
                          </div>
                        ) : (
                          <div className="p-3 border rounded bg-yellow-50 text-center">
                            <p className="text-sm text-yellow-700">
                              Adjust artifact to reduce error to target reading
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                        </Card>
                    )}






                </CardContent>
                <CardFooter className="justify-between">
                    <Button variant="outline" onClick={handlePrevStep}><ChevronLeft /> Back</Button>
                    <Button onClick={handleNextStep} disabled={!isCompleted} className="bg-primary hover:bg-primary/90">
                        {isCompleted ? "Proceed to Final Measurements" : "Complete Alignment to Proceed"} <ChevronRight />
                    </Button>
                </CardFooter>
            </Card>
        );
      }
      case "referenceMeasurement": {
        const progress = (squaringMeasurements.length / numMeasurements) * 100;
        return (
          <Card>
            <CardHeader>
              <CardTitle>Step 3: Reference Measurement</CardTitle>
              <CardDescription>
                Record readings at the specified intervals along the squared reference axis. The first reading is your reference zero.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <LiveReadingCard reading={currentReading} isConnected={isConnected} />
              <div className="space-y-2">
                <Label>Measurement Progress</Label>
                <Progress value={progress} />
                <p className="text-sm text-center text-muted-foreground">{squaringMeasurements.length} of {numMeasurements} measurements recorded.</p>
              </div>
              <div className="space-y-2">
                <Label>Recorded Measurements (μm)</Label>
                <div className="p-2 border rounded-md min-h-[50px] bg-muted/50">
                  {squaringMeasurements.map((m, i) => (
                    <p key={`sq-ref-${i}`}>Position {m.position}mm: <strong>{m.reading.toFixed(3)}</strong></p>
                  ))}
                </div>
              </div>
            </CardContent>
            <CardFooter className="justify-between">
              <Button variant="outline" onClick={handlePrevStep}><ChevronLeft /> Back</Button>
              {squaringMeasurements.length < numMeasurements ? (
                <Button onClick={recordSquaringMeasurement} disabled={!isConnected}>
                   Record Reading ({squaringMeasurements.length === 0 ? '0' : (distance > 200 ? (squaringMeasurements.length) * 100 : distance)}mm) <Check/>
                </Button>
              ) : (
                <Button onClick={handleNextStep} className="bg-primary hover:bg-primary/90">
                  Reference Complete <ChevronRight />
                </Button>
              )}
            </CardFooter>
          </Card>
        );
      }
      case "adjustment": {
        const isCompleted = upperTargetProgress?.isWithinTolerance || false;
        
        return (
          <Card>
            <CardHeader>
                    <CardTitle>Step 4: Upper Axis Adjustment (Three-Phase Method)</CardTitle>
              <CardDescription>
                        Systematic metrology workflow: Measure initial error → Calibrate adjustment → Execute calculated correction
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Live Indicator Reading */}
              <Card>
                <CardHeader>
                  <CardTitle as="h3" className="text-base">Current Indicator Reading</CardTitle>
                  <CardDescription className="text-xs">Live reading from Probe A</CardDescription>
                </CardHeader>
                <CardContent>
                <LiveReadingCard 
                    reading={currentReading}
                    isConnected={isConnected} 
                    label="Live Reading"
                  />
                </CardContent>
              </Card>

              {/* Phase 1: Measure Initial Angular Error */}
              <Card>
                <CardHeader>
                  <CardTitle as="h3" className="text-base">
                    Phase 1: Measure Initial Angular Error 
                    <Badge className="ml-2">
                      {upperCurrentPhase === 1 ? "Active" : upperCurrentPhase > 1 ? "Complete" : "Pending"}
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Record readings at 0mm and {measurementDistance}mm to calculate initial error angle
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Reading at 0mm (A1)</Label>
                      <div className="p-3 border rounded bg-muted/50 text-center">
                        <p className="text-lg font-semibold">
                          {upperA1_initial !== null ? upperA1_initial.toFixed(3) : "---"} μm
                        </p>
                      </div>
                      <Button
                        onClick={() => {
                          sendCommand("FNC 1\r");
                          setTimeout(() => setUpperA1_initial(currentReadingRef.current), 300);
                        }}
                        disabled={!isConnected || upperCurrentPhase !== 1}
                        size="sm"
                        className="w-full"
                      >
                        Record A1
                      </Button>
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Reading at {measurementDistance}mm (A2)</Label>
                      <div className="p-3 border rounded bg-muted/50 text-center">
                        <p className="text-lg font-semibold">
                          {upperA2_initial !== null ? upperA2_initial.toFixed(3) : "---"} μm
                        </p>
                      </div>
                      <Button
                        onClick={() => {
                          sendCommand("FNC 1\r");
                          setTimeout(() => {
                            const reading = currentReadingRef.current;
                            setUpperA2_initial(reading);
                            if (upperA1_initial !== null && reading !== null) {
                              const result = calculateInitialAngle(upperA1_initial, reading, parseFloat(measurementDistance));
                              setUpperTheta_initial(result);
                            }
                          }, 300);
                        }}
                        disabled={!isConnected || upperCurrentPhase !== 1 || upperA1_initial === null}
                        size="sm"
                        className="w-full"
                      >
                        Record A2
                      </Button>
                    </div>
                  </div>
                  
                  {upperTheta_initial && (
                    <div className="p-3 border rounded bg-blue-50 text-center">
                      <p className="text-sm font-semibold text-blue-700">
                        ✓ Initial Error: {upperTheta_initial.value.toFixed(2)} arcseconds
                      </p>
                    </div>
                  )}
                  
                  {upperTheta_initial && upperCurrentPhase === 1 && (
                    <Button
                      onClick={() => setUpperCurrentPhase(2)}
                      className="w-full"
                    >
                      Next Phase →
                    </Button>
                  )}
                </CardContent>
              </Card>

              {/* Phase 2: Calibrate Adjustment (Find Pivot) */}
              {upperCurrentPhase >= 2 && (
                    <Card>
                        <CardHeader>
                    <CardTitle as="h3" className="text-base">
                      Phase 2: Calibrate Adjustment (Find Pivot)
                      <Badge className="ml-2">
                        {upperCurrentPhase === 2 ? "Active" : upperCurrentPhase > 2 ? "Complete" : "Pending"}
                      </Badge>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Make test adjustment to learn your setup's geometry. Re-record values after large adjustments to check if pivot point changed.
                    </CardDescription>
                        </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      1. At {measurementDistance}mm position, make a deliberate angular adjustment<br/>
                      2. Record new reading at {measurementDistance}mm<br/>
                      3. Move back to 0mm and record reading<br/>
                      4. Calculate lever arm distance
                    </p>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Test reading at {measurementDistance}mm</Label>
                        <div className="p-3 border rounded bg-muted/50 text-center">
                          <p className="text-lg font-semibold">
                            {upperA2_test !== null ? upperA2_test.toFixed(3) : "---"} μm
                          </p>
                        </div>
                        <Button
                          onClick={() => {
                            sendCommand("FNC 1\r");
                            setTimeout(() => setUpperA2_test(currentReadingRef.current), 300);
                          }}
                          disabled={!isConnected || upperCurrentPhase < 2}
                          size="sm"
                          className="w-full"
                        >
                          Record A2_test
                        </Button>
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Test reading at 0mm</Label>
                        <div className="p-3 border rounded bg-muted/50 text-center">
                          <p className="text-lg font-semibold">
                            {upperA1_test !== null ? upperA1_test.toFixed(3) : "---"} μm
                          </p>
                        </div>
                        <Button
                          onClick={() => {
                            sendCommand("FNC 1\r");
                            setTimeout(() => {
                              const reading = currentReadingRef.current;
                              setUpperA1_test(reading);
                              if (upperA1_initial !== null && upperA2_initial !== null && upperA2_test !== null && reading !== null) {
                                const result = calculateLeverArm(upperA1_initial, upperA2_initial, reading, upperA2_test, parseFloat(measurementDistance));
                                setUpperLeverArmResult(result);
                                if (result && upperA2_test !== null) {
                                  const targetCalc = calculateTargetReading(upperA2_test, result.leverArm, result.theta_after_test);
                                  setUpperTargetResult(targetCalc);
                                  
                                  // Add to calibration history
                                  const newCalibration = {
                                    leverArm: result.leverArm,
                                    timestamp: Date.now(),
                                    A1_test: reading,
                                    A2_test: upperA2_test,
                                    theta_after_test: result.theta_after_test
                                  };
                                  console.log('Adding upper calibration to history:', newCalibration);
                                  setUpperCalibrationHistory(prev => {
                                    const newHistory = [...prev, newCalibration];
                                    console.log('New upper calibration history:', newHistory);
                                    return newHistory;
                                  });
                                }
                              }
                            }, 300);
                          }}
                          disabled={!isConnected || upperCurrentPhase < 2 || upperA2_test === null}
                          size="sm"
                          className="w-full"
                        >
                          Record A1_test
                        </Button>
                      </div>
                    </div>
                    
                    {upperLeverArmResult && (
                      <div className="p-3 border rounded bg-green-50 space-y-1">
                        <p className="text-sm font-semibold text-green-700">✓ Calibration Complete:</p>
                        <p className="text-xs text-green-600">Lever Arm: {upperLeverArmResult.leverArm.toFixed(1)} mm</p>
                        <p className="text-xs text-green-600">Angle after test: {upperLeverArmResult.theta_after_test.toFixed(2)} arcsec</p>
                      </div>
                    )}
                    
                    {/* Debug Info */}
                    <div className="p-2 border rounded bg-gray-100 text-gray-800 text-xs font-mono">
                      <p><strong>Upper Axis Debug Info:</strong></p>
                      <p>History Count: {upperCalibrationHistory.length}</p>
                      <p>Confidence: {upperPivotConfidence.level} (±{upperPivotConfidence.variation.toFixed(1)}%)</p>
                      <p>Lever Arms: [{upperCalibrationHistory.map(h => h.leverArm.toFixed(1)).join(', ')}]</p>
                      {upperCalibrationHistory.length >= 2 && (
                        <p>Variation: {((Math.sqrt(upperCalibrationHistory.map(h => h.leverArm).reduce((sum, val, _, arr) => {
                          const avg = arr.reduce((s, v) => s + v, 0) / arr.length;
                          return sum + Math.pow(val - avg, 2);
                        }, 0) / upperCalibrationHistory.length) / (upperCalibrationHistory.map(h => h.leverArm).reduce((s, v) => s + v, 0) / upperCalibrationHistory.length)) * 100).toFixed(1)}%</p>
                      )}
                    </div>
                    
                    {/* Confidence Display */}
                    {upperPivotConfidence.level !== "unknown" && (
                      <div className={`p-3 border-2 rounded space-y-1 ${
                        upperPivotConfidence.level === "high" ? "bg-green-100 border-green-400 text-green-800" :
                        upperPivotConfidence.level === "medium" ? "bg-yellow-100 border-yellow-400 text-yellow-800" : 
                        "bg-red-100 border-red-400 text-red-800"
                      }`}>
                        <div className="flex justify-between items-center">
                          <p className="text-sm font-semibold">Pivot Confidence: {upperPivotConfidence.level.toUpperCase()}</p>
                          <span className="text-xs">±{upperPivotConfidence.variation.toFixed(1)}%</span>
                        </div>
                        <p className="text-xs">{upperPivotConfidence.message}</p>
                        <p className="text-xs">Calibrations: {upperCalibrationHistory.length}</p>
                      </div>
                    )}
                    
                    {upperLeverArmResult && upperCurrentPhase === 2 && (
                      <Button
                        onClick={() => setUpperCurrentPhase(3)}
                        className="w-full"
                      >
                        Next Phase →
                      </Button>
                    )}
                        </CardContent>
                    </Card>
                )}

              {/* Phase 3: Execute Final Correction */}
              {upperCurrentPhase >= 3 && upperTargetResult && (
                <Card>
                  <CardHeader>
                    <CardTitle as="h3" className="text-base">
                      Phase 3: Execute Final Correction
                      <Badge className="ml-2">Active</Badge>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Adjust upper axis until reading matches calculated target
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Move carriage to {measurementDistance}mm and adjust upper axis until target reached
                    </p>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center">
                        <Label>Current Reading</Label>
                        <div className="text-2xl font-bold text-blue-600">
                          {currentReading?.toFixed(3)} μm
                        </div>
                      </div>
                      <div className="text-center">
                        <Label>Target Reading</Label>
                        <div className="text-2xl font-bold text-green-600">
                          {upperTargetResult.target.toFixed(3)} μm
                        </div>
                      </div>
                    </div>
                    
                    {upperTargetProgress && (
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Progress to Target</span>
                          <span>Error: {upperTargetProgress.error.toFixed(1)} μm</span>
                        </div>
                        <Progress value={upperTargetProgress.progress} className="h-2" />
                        
                        {upperTargetProgress.isWithinTolerance ? (
                          <div className="p-3 border rounded bg-green-50 text-center">
                            <p className="text-sm font-semibold text-green-700">
                              🎯 Target Achieved! Upper axis aligned within tolerance.
                            </p>
                          </div>
                        ) : (
                          <div className="p-3 border rounded bg-yellow-50 text-center">
                            <p className="text-sm text-yellow-700">
                              Adjust upper axis to reduce error to target reading
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                    </Card>
                )}

            </CardContent>
            <CardFooter className="justify-between">
              <Button variant="outline" onClick={handlePrevStep}><ChevronLeft /> Back</Button>
                    <Button onClick={handleNextStep} disabled={!isCompleted} className="bg-primary hover:bg-primary/90">
                        {isCompleted ? "Proceed to Final Measurements" : "Complete Alignment to Proceed"} <ChevronRight />
              </Button>
            </CardFooter>
          </Card>
        );
      }
      case "finalMeasurement": {
        const progress = (measurements.length / numMeasurements) * 100;
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Step 5: Final Measurement</CardTitle>
                    <CardDescription>
                        Move to the perpendicular face. Record readings at the specified intervals. The first reading is your new reference.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <LiveReadingCard reading={currentReading} isConnected={isConnected} />
                    <div className="space-y-2">
                        <Label>Measurement Progress</Label>
                        <Progress value={progress} />
                        <p className="text-sm text-center text-muted-foreground">{measurements.length} of {numMeasurements} measurements recorded.</p>
                    </div>
                    <div className="space-y-2">
                        <Label>Recorded Measurements (μm)</Label>
                        <div className="p-2 border rounded-md min-h-[50px] bg-muted/50">
                            {measurements.map((m, i) => (
                                <p key={`meas-${i}`}>Position {m.position}mm: <strong>{m.reading.toFixed(3)}</strong></p>
                            ))}
                        </div>
                    </div>
                </CardContent>
                <CardFooter className="justify-between">
                    <Button variant="outline" onClick={handlePrevStep}><ChevronLeft /> Back</Button>
                    {measurements.length < numMeasurements ? (
                        <Button onClick={recordMeasurement} disabled={!isConnected}>
                            Record Reading ({measurements.length === 0 ? '0' : (distance > 200 ? (measurements.length) * 100 : distance)}mm) <Check/>
                        </Button>
                    ) : (
                        <Button onClick={handleNextStep} className="bg-accent hover:bg-accent/90">
                            Calculate Results <ChevronRight />
                        </Button>
                    )}
                </CardFooter>
            </Card>
        );
      }
      case "results":
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Step 6: Results</CardTitle>
                    <CardDescription>The orthogonality measurement is complete. Review and generate your report.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle as="h3" className="text-lg font-medium">Compensated Orthogonality</CardTitle>
                            <Calculator className="w-6 h-6 text-muted-foreground" />
                        </CardHeader>
                        <CardContent className="flex flex-col items-center justify-center h-32">
                            <div className="text-6xl font-bold text-accent font-headline" aria-live="polite">
                                {finalResult ? Math.abs(finalResult.value).toFixed(3) : "---"}
                            </div>
                            <p className="text-lg text-muted-foreground">
                                {finalResult ? finalResult.unit : "N/A"}
                            </p>
                        </CardContent>
                    </Card>
                    
                    {detailedResults && (
                        <Card>
                            <CardHeader>
                                <CardTitle as="h3" className="text-lg font-medium">Calculation Breakdown</CardTitle>
                                <CardDescription>Detailed analysis of measurement compensation</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                                    <div className="p-3 border rounded">
                                        <p className="text-sm text-muted-foreground">Raw Orthogonality</p>
                                        <p className="text-xl font-semibold">{detailedResults.rawOrthogonality.toFixed(3)}"</p>
                                        <p className="text-xs text-muted-foreground">Before compensation</p>
                                    </div>
                                    <div className="p-3 border rounded">
                                        <p className="text-sm text-muted-foreground">Artifact Error</p>
                                        <p className="text-xl font-semibold">{detailedResults.artifactError.toFixed(3)}"</p>
                                        <p className="text-xs text-muted-foreground">Reference face slope</p>
                                    </div>
                                    <div className="p-3 border rounded bg-green-50">
                                        <p className="text-sm text-muted-foreground">Final Result</p>
                                        <p className="text-xl font-semibold text-green-700">{detailedResults.compensatedOrthogonality.toFixed(3)}"</p>
                                        <p className="text-xs text-muted-foreground">Compensated orthogonality</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                    <div className="p-3 border rounded bg-blue-50">
                                        <p className="font-semibold text-blue-700">Step 3: Reference Measurements</p>
                                        <p>Slope: {detailedResults.referenceFit.slope.toFixed(3)} μm/mm</p>
                                        <p>Angle: {detailedResults.referenceFit.slopeArcsec.toFixed(3)}"</p>
                                        <p>R²: {detailedResults.referenceFit.rSquared.toFixed(3)}</p>
                                    </div>
                                    <div className="p-3 border rounded bg-purple-50">
                                        <p className="font-semibold text-purple-700">Step 5: Final Measurements</p>
                                        <p>Slope: {detailedResults.finalFit.slope.toFixed(3)} μm/mm</p>
                                        <p>Angle: {detailedResults.finalFit.slopeArcsec.toFixed(3)}"</p>
                                        <p>R²: {detailedResults.finalFit.rSquared.toFixed(3)}</p>
                                    </div>
                                </div>
                                <div className="p-3 border rounded bg-gray-50 text-center">
                                    <p className="text-sm text-muted-foreground">
                                        Calculation: {detailedResults.rawOrthogonality.toFixed(3)}" - ({detailedResults.artifactError.toFixed(3)}") = {detailedResults.compensatedOrthogonality.toFixed(3)}"
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                     <ResultChart
                        isUITier
                        travelDistance={parseFloat(measurementDistance)}
                        finalMeasurement={measurements[measurements.length - 1]}
                        referenceMeasurement={measurements[0]}
                        measurements={measurements}
                        squaringMeasurements={squaringMeasurements}
                    />
                </CardContent>
                <CardFooter className="justify-between">
                    <Button variant="outline" onClick={handlePrevStep}><ChevronLeft /> Back</Button>
                    <Button onClick={handlePrint}>
                        <FileText className="mr-2" /> Generate Report
                    </Button>
                </CardFooter>
            </Card>
        );
    }
  };
  
  return (
    <>
      <div id="print-report" className="hidden print-show">
         <PrintableReport
            reportData={reportData}
            finalResult={finalResult}
            spec={SPEC_ARCSECONDS}
            measurementDistance={measurementDistance}
            finalMeasurement={measurements[measurements.length - 1]}
            referenceMeasurement={measurements[0]}
            measurements={measurements}
            squaringMeasurements={squaringMeasurements}
          />
      </div>

      <div className="space-y-8 no-print">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-3xl font-bold font-headline">Measurement Process</h2>
            <p className="text-muted-foreground">
              A step-by-step guide to measuring orthogonality.
            </p>
          </div>
          <Button onClick={resetProcess} variant="outline">
            <RotateCcw className="mr-2" />
            Start Over
          </Button>
        </div>
        <div className="max-w-2xl mx-auto">
            {renderStepContent()}
        </div>
      </div>
    </>
  );
}

function LiveReadingCard({
    reading, 
    isConnected, 
    label = "Live Reading",
}: {
    reading: number, 
    isConnected: boolean, 
    label?: string,
}) {

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle as="h3" className="text-lg font-medium">{label}</CardTitle>
                <Zap className={cn("w-6 h-6 transition-colors", isConnected ? "text-accent" : "text-muted-foreground")} />
            </CardHeader>
            <CardContent className="flex items-center justify-center h-24 text-center">
                 <p className="text-4xl font-semibold transition-colors duration-300 font-code">
                    {reading.toFixed(3)}{" "}
                    <span className="text-xl text-muted-foreground">μm</span>
                </p>
            </CardContent>
        </Card>
    )
}

function AdjustmentBar({ 
  result, 
  spec, 
  showSpecMessage = true 
}: { 
  result: OrthogonalityResult, 
  spec: number,
  showSpecMessage?: boolean
}) {
  console.log('🎯 AdjustmentBar - result:', result);
  console.log('🎯 AdjustmentBar - result?.value:', result?.value);
  console.log('🎯 AdjustmentBar - spec:', spec);
  
  if (!result) {
    console.log('AdjustmentBar - returning null because result is falsy');
    return null;
  }

  const { value, unit } = result;
  
  console.log('AdjustmentBar - value:', value, 'unit:', unit);

  // Since we're now only using arcseconds, we can simplify this
  const valueInArcsec = value; // Already in arcseconds
  const maxDisplayArcsec = spec * 3; 
  
  const percentage = maxDisplayArcsec !== 0 
    ? Math.max(-100, Math.min(100, (valueInArcsec / maxDisplayArcsec) * 100))
    : 0;

  const inSpec = Math.abs(value) <= spec;

  const indicatorPosition = `calc(${50 + percentage / 2}%)`;

  console.log('AdjustmentBar - rendering with value:', value, 'unit:', unit, 'inSpec:', inSpec);

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h3">Live Adjustment</CardTitle>
        <CardDescription>Adjust until the indicator is in the green zone.</CardDescription>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        <div className="relative w-full h-8 bg-muted rounded-full overflow-hidden border">
          <div className="absolute top-0 h-full bg-red-500/50 w-full"></div>
          <div 
            className="absolute top-0 h-full bg-green-500/50"
            style={{ 
                left: `calc(50% - ${ (spec / maxDisplayArcsec) * 50}%)`,
                width: `${ (spec / maxDisplayArcsec) * 100}%`
            }}
          ></div>
          <div 
            className={cn(
              "absolute top-1/2 -translate-y-1/2 w-1.5 h-10 rounded-full transition-all duration-200 ease-linear border-2",
              inSpec ? "bg-green-400 border-green-700" : "bg-red-400 border-red-700"
            )}
            style={{ left: indicatorPosition }}
          />
        </div>
        <div className="text-center">
            <p className="font-bold text-lg">{value.toFixed(2)} {unit}</p>
            {showSpecMessage && (
              <p className={cn("font-semibold", inSpec ? "text-green-500" : "text-red-500")}>
                  {inSpec ? "✔ In Spec" : "✖ Out of Spec"}
              </p>
            )}
        </div>
      </CardContent>
    </Card>
  )
}

function ResultChart({
    travelDistance,
    referenceMeasurement,
    finalMeasurement,
    measurements = [],
    squaringMeasurements = [],
    isUITier = false,
}: {
    travelDistance: number,
    referenceMeasurement?: Measurement,
    finalMeasurement?: Measurement,
    measurements?: Measurement[],
    squaringMeasurements?: Measurement[],
    isUITier?: boolean
}) {
    // Generate chart data from actual measurements
    const generateChartData = () => {
        // Show data if we have either reference measurements OR orthogonality measurements
        if ((!squaringMeasurements || squaringMeasurements.length === 0) && (!measurements || measurements.length === 0)) {
            // No measurements available - return empty array
            return [];
        }

        // Create L-shape: reference line vertical, measurement line horizontal
        // Shift both sets so their first point = 0, then plot reference vertically and measurement horizontally
        
        const referenceShift = squaringMeasurements[0]?.reading || 0;
        const measurementShift = measurements[0]?.reading || 0;
        
        return squaringMeasurements.map((refPoint, index) => {
            const measPoint = measurements[index];
            return {
                // Coordinate System 1: measurement line (red)
                y1: (measPoint?.reading || 0) - measurementShift, // measurement reading
                
                // Coordinate System 2: reference line (blue) 
                y2: refPoint.reading - referenceShift, // reference reading
                
                // Keep original fields for compatibility
                position: refPoint.position,
                reference: refPoint.reading - referenceShift,
                measurement: (measPoint?.reading || 0) - measurementShift,
                bestFit: (measPoint?.reading || 0) - measurementShift,
                
                // For L-shape plotting
                refY: refPoint.reading - referenceShift, // Y for reference line
                measY: refPoint.position // Y for measurement line
            };
        });
    };

    const chartData = generateChartData();
    console.log('Final check - chartData.length:', chartData.length, 'chartData:', chartData);

    // Don't render chart if no measurements available
    if (chartData.length === 0) {
        return (
            <div className="mb-4">
                <div className="text-center mb-4">
                    <p className="text-sm text-gray-600 font-medium">Error Exaggerated 10000X</p>
                </div>
                <div className="h-80 flex items-center justify-center border border-gray-200 rounded">
                    <p className="text-gray-500">No measurement data available</p>
                </div>
            </div>
        );
    }

    return (
        <div className="mb-4">
            <div className="text-center mb-4">
                <p className="text-sm text-gray-600 font-medium">Error Exaggerated 10000X</p>
            </div>
            {isUITier ? (
                // For UI: responsive square chart
                <div className="h-80">
                    <svg width="100%" height="100%" viewBox="0 0 720 720" style={{ background: 'white' }}>
                        {/* Grid */}
                        <defs>
                            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#ccc" strokeWidth="1"/>
                            </pattern>
                        </defs>
                        <rect width="100%" height="100%" fill="url(#grid)" />
                        
                        {/* Axes */}
                        <line x1="60" y1="660" x2="660" y2="660" stroke="black" strokeWidth="2" />
                        <line x1="60" y1="60" x2="60" y2="660" stroke="black" strokeWidth="2" />
                        
                        {/* Axis labels */}
                        <text x="360" y="690" textAnchor="middle" fontSize="12">Direction 1</text>
                        <text x="30" y="360" textAnchor="middle" fontSize="12" transform="rotate(-90, 30, 360)">Direction 2</text>
                        
                        {/* L-shape plotting with 4-coordinate system */}
                        {(() => {
                            const margin = { left: 60, right: 60, top: 60, bottom: 60 };
                            const width = 600;
                            const height = 600;
                            
                            // Calculate scales for the 4-coordinate system
                            const maxPosition = Math.max(...squaringMeasurements.map(m => m.position));
                            const maxRefReading = Math.max(...squaringMeasurements.map(m => m.reading));
                            const maxMeasReading = Math.max(...measurements.map(m => m.reading));
                            
                            // Normalize scales so both lines have similar visual length
                            const maxRange = Math.max(maxPosition, maxRefReading, maxMeasReading);
                            
                            const xScale = (x) => margin.left + (x / maxRange) * width;
                            const yScale = (y) => margin.top + height - (y / maxRange) * height;
                            
                            // Calculate best fit lines
                            const calculateBestFit = (points) => {
                                const n = points.length;
                                const sumX = points.reduce((sum, p) => sum + p.x, 0);
                                const sumY = points.reduce((sum, p) => sum + p.y, 0);
                                const sumXY = points.reduce((sum, p) => sum + p.x * p.y, 0);
                                const sumXX = points.reduce((sum, p) => sum + p.x * p.x, 0);
                                
                                const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
                                const intercept = (sumY - slope * sumX) / n;
                                
                                return { slope, intercept };
                            };
                            
                            // Reference data points for best fit
                            const refDataPoints = squaringMeasurements.map((point, i) => ({
                                x: point.reading - (squaringMeasurements[0]?.reading || 0), // x2: reference readings
                                y: point.position // y1: reference position
                            }));
                            
                            // Measurement data points for best fit
                            const measDataPoints = measurements.map((point, i) => ({
                                x: squaringMeasurements[i]?.position || 0, // x1: orthogonality position
                                y: point.reading - (measurements[0]?.reading || 0) // y2: orthogonality readings
                            }));
                            
                            // Calculate best fit lines
                            const refBestFit = calculateBestFit(refDataPoints);
                            const measBestFit = calculateBestFit(measDataPoints);
                            
                            // Generate best fit line points with separate ranges for each line
                            const refMinX = Math.min(...refDataPoints.map(p => p.x));
                            const refMaxX = Math.max(...refDataPoints.map(p => p.x));
                            const refMinY = Math.min(...refDataPoints.map(p => p.y));
                            const refMaxY = Math.max(...refDataPoints.map(p => p.y));
                            
                            const measMinX = Math.min(...measDataPoints.map(p => p.x));
                            const measMaxX = Math.max(...measDataPoints.map(p => p.x));
                            const measMinY = Math.min(...measDataPoints.map(p => p.y));
                            const measMaxY = Math.max(...measDataPoints.map(p => p.y));
                            
                            // Reference best fit line (blue) - use reference data range
                            const refLineStart = { x: refMinX, y: refBestFit.slope * refMinX + refBestFit.intercept };
                            const refLineEnd = { x: refMaxX, y: refBestFit.slope * refMaxX + refBestFit.intercept };
                            
                            // Measurement best fit line (red) - use measurement data range
                            const measLineStart = { x: measMinX, y: measBestFit.slope * measMinX + measBestFit.intercept };
                            const measLineEnd = { x: measMaxX, y: measBestFit.slope * measMaxX + measBestFit.intercept };
                            
                            return (
                                <>
                                    {/* Reference best fit line (Blue) */}
                                    <line 
                                        x1={xScale(refLineStart.x)} 
                                        y1={yScale(refLineStart.y)} 
                                        x2={xScale(refLineEnd.x)} 
                                        y2={yScale(refLineEnd.y)} 
                                        stroke="blue" 
                                        strokeWidth="2" 
                                    />
                                    
                                    {/* Measurement best fit line (Red) */}
                                    <line 
                                        x1={xScale(measLineStart.x)} 
                                        y1={yScale(measLineStart.y)} 
                                        x2={xScale(measLineEnd.x)} 
                                        y2={yScale(measLineEnd.y)} 
                                        stroke="red" 
                                        strokeWidth="2" 
                                    />
                                    
                                    {/* X markers for actual data points */}
                                    {refDataPoints.map((point, i) => (
                                        <g key={`ref-${i}`}>
                                            <line x1={xScale(point.x)-4} y1={yScale(point.y)-4} x2={xScale(point.x)+4} y2={yScale(point.y)+4} stroke="gray" strokeWidth="2" />
                                            <line x1={xScale(point.x)-4} y1={yScale(point.y)+4} x2={xScale(point.x)+4} y2={yScale(point.y)-4} stroke="gray" strokeWidth="2" />
                                        </g>
                                    ))}
                                    
                                    {measDataPoints.map((point, i) => (
                                        <g key={`meas-${i}`}>
                                            <line x1={xScale(point.x)-4} y1={yScale(point.y)-4} x2={xScale(point.x)+4} y2={yScale(point.y)+4} stroke="gray" strokeWidth="2" />
                                            <line x1={xScale(point.x)-4} y1={yScale(point.y)+4} x2={xScale(point.x)+4} y2={yScale(point.y)-4} stroke="gray" strokeWidth="2" />
                                        </g>
                                    ))}
                                </>
                            );
                        })()}
                    </svg>
                </div>
            ) : (
                // For print/PDF: fixed square dimensions
                <div style={{ width: 400, height: 400, border: '1px solid #ccc' }}>
                    <svg width="400" height="400" style={{ background: 'white' }}>
                        {/* Grid */}
                        <defs>
                            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#ccc" strokeWidth="1"/>
                            </pattern>
                        </defs>
                        <rect width="100%" height="100%" fill="url(#grid)" />
                        
                        {/* Axes */}
                        <line x1="40" y1="360" x2="360" y2="360" stroke="black" strokeWidth="2" />
                        <line x1="40" y1="40" x2="40" y2="360" stroke="black" strokeWidth="2" />
                        
                        {/* Axis labels */}
                        <text x="200" y="380" textAnchor="middle" fontSize="10">Direction 1</text>
                        <text x="20" y="200" textAnchor="middle" fontSize="10" transform="rotate(-90, 20, 200)">Direction 2</text>
                        
                        {/* L-shape plotting with 4-coordinate system */}
                        {(() => {
                            const margin = { left: 40, right: 40, top: 40, bottom: 40 };
                            const width = 320;
                            const height = 320;
                            
                            // Calculate scales for the 4-coordinate system
                            const maxPosition = Math.max(...squaringMeasurements.map(m => m.position));
                            const maxRefReading = Math.max(...squaringMeasurements.map(m => m.reading));
                            const maxMeasReading = Math.max(...measurements.map(m => m.reading));
                            
                            // Normalize scales so both lines have similar visual length
                            const maxRange = Math.max(maxPosition, maxRefReading, maxMeasReading);
                            
                            const xScale = (x) => margin.left + (x / maxRange) * width;
                            const yScale = (y) => margin.top + height - (y / maxRange) * height;
                            
                            // Calculate best fit lines
                            const calculateBestFit = (points) => {
                                const n = points.length;
                                const sumX = points.reduce((sum, p) => sum + p.x, 0);
                                const sumY = points.reduce((sum, p) => sum + p.y, 0);
                                const sumXY = points.reduce((sum, p) => sum + p.x * p.y, 0);
                                const sumXX = points.reduce((sum, p) => sum + p.x * p.x, 0);
                                
                                const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
                                const intercept = (sumY - slope * sumX) / n;
                                
                                return { slope, intercept };
                            };
                            
                            // Reference data points for best fit
                            const refDataPoints = squaringMeasurements.map((point, i) => ({
                                x: point.reading - (squaringMeasurements[0]?.reading || 0), // x2: reference readings
                                y: point.position // y1: reference position
                            }));
                            
                            // Measurement data points for best fit
                            const measDataPoints = measurements.map((point, i) => ({
                                x: squaringMeasurements[i]?.position || 0, // x1: orthogonality position
                                y: point.reading - (measurements[0]?.reading || 0) // y2: orthogonality readings
                            }));
                            
                            // Calculate best fit lines
                            const refBestFit = calculateBestFit(refDataPoints);
                            const measBestFit = calculateBestFit(measDataPoints);
                            
                            // Generate best fit line points with separate ranges for each line
                            const refMinX = Math.min(...refDataPoints.map(p => p.x));
                            const refMaxX = Math.max(...refDataPoints.map(p => p.x));
                            const refMinY = Math.min(...refDataPoints.map(p => p.y));
                            const refMaxY = Math.max(...refDataPoints.map(p => p.y));
                            
                            const measMinX = Math.min(...measDataPoints.map(p => p.x));
                            const measMaxX = Math.max(...measDataPoints.map(p => p.x));
                            const measMinY = Math.min(...measDataPoints.map(p => p.y));
                            const measMaxY = Math.max(...measDataPoints.map(p => p.y));
                            
                            // Reference best fit line (blue) - use reference data range
                            const refLineStart = { x: refMinX, y: refBestFit.slope * refMinX + refBestFit.intercept };
                            const refLineEnd = { x: refMaxX, y: refBestFit.slope * refMaxX + refBestFit.intercept };
                            
                            // Measurement best fit line (red) - use measurement data range
                            const measLineStart = { x: measMinX, y: measBestFit.slope * measMinX + measBestFit.intercept };
                            const measLineEnd = { x: measMaxX, y: measBestFit.slope * measMaxX + measBestFit.intercept };
                            
                            return (
                                <>
                                    {/* Reference best fit line (Blue) */}
                                    <line 
                                        x1={xScale(refLineStart.x)} 
                                        y1={yScale(refLineStart.y)} 
                                        x2={xScale(refLineEnd.x)} 
                                        y2={yScale(refLineEnd.y)} 
                                        stroke="blue" 
                                        strokeWidth="2" 
                                    />
                                    
                                    {/* Measurement best fit line (Red) */}
                                    <line 
                                        x1={xScale(measLineStart.x)} 
                                        y1={yScale(measLineStart.y)} 
                                        x2={xScale(measLineEnd.x)} 
                                        y2={yScale(measLineEnd.y)} 
                                        stroke="red" 
                                        strokeWidth="2" 
                                    />
                                    
                                    {/* X markers for actual data points */}
                                    {refDataPoints.map((point, i) => (
                                        <g key={`ref-${i}`}>
                                            <line x1={xScale(point.x)-4} y1={yScale(point.y)-4} x2={xScale(point.x)+4} y2={yScale(point.y)+4} stroke="gray" strokeWidth="2" />
                                            <line x1={xScale(point.x)-4} y1={yScale(point.y)+4} x2={xScale(point.x)+4} y2={yScale(point.y)-4} stroke="gray" strokeWidth="2" />
                                        </g>
                                    ))}
                                    
                                    {measDataPoints.map((point, i) => (
                                        <g key={`meas-${i}`}>
                                            <line x1={xScale(point.x)-4} y1={yScale(point.y)-4} x2={xScale(point.x)+4} y2={yScale(point.y)+4} stroke="gray" strokeWidth="2" />
                                            <line x1={xScale(point.x)-4} y1={yScale(point.y)+4} x2={xScale(point.x)+4} y2={yScale(point.y)-4} stroke="gray" strokeWidth="2" />
                                        </g>
                                    ))}
                                </>
                            );
                        })()}
                    </svg>
                </div>
            )}
        </div>
    );
}

function PrintableReport({
  reportData,
  finalResult,
  spec,
  measurementDistance,
  referenceMeasurement,
  finalMeasurement,
  measurements = [],
  squaringMeasurements = [],
}: {
  reportData: ReportData;
  finalResult: OrthogonalityResult;
  spec: number;
  measurementDistance: string;
  referenceMeasurement?: Measurement;
  finalMeasurement?: Measurement;
  measurements?: Measurement[];
  squaringMeasurements?: Measurement[];
}) {

  const resultValue = finalResult?.value ?? 0;
  const inSpec = finalResult?.unit === 'arcsec' && Math.abs(resultValue) <= spec;

  return (
    <div className="p-8 font-sans bg-white text-black printable-area flex flex-col min-h-[95vh]">
      <header className="flex items-center justify-center pb-4 mb-4 border-b border-gray-300 relative">
        <img src="/AerotechLogo.svg" alt="Aerotech Logo" className="absolute left-0 h-12 w-auto" />
        <h1 className="text-2xl font-bold text-gray-700 text-center">Axis Alignment</h1>
      </header>
      
      <main className="flex-1">
        <ResultChart
            travelDistance={parseFloat(measurementDistance)}
            finalMeasurement={finalMeasurement}
            referenceMeasurement={referenceMeasurement}
            measurements={measurements}
            squaringMeasurements={squaringMeasurements}
        />
      </main>
      
      <section className="mt-4 grid grid-cols-3 gap-4 text-xs">
        <div className="p-2 border border-gray-300">
          <h3 className="font-bold border-b border-gray-300 pb-1 mb-1">Results</h3>
          <div className="space-y-1">
            <div>Orthogonality = {finalResult ? `${Math.abs(resultValue).toFixed(1)} μm` : '2.1 μm'}</div>
          </div>
        </div>
        
        <div className="p-2 border border-gray-300">
          <h3 className="font-bold border-b border-gray-300 pb-1 mb-1">Comments</h3>
          <div className="space-y-1 text-xs">
            <div>Axis 1 Serial Number: {reportData.axis1Serial}</div>
            <div>Axis 2 Serial Number: {reportData.axis2Serial}</div>
            <div>Order Number: {reportData.orderNumber}</div>
            <div>Customer Name: {reportData.customerName}</div>
            <div>Alignment Part Number: {reportData.alignmentPartNumber}</div>
          </div>
        </div>
        
        <div className="p-2 border border-gray-300">
          <h3 className="font-bold border-b border-gray-300 pb-1 mb-1">Test Conditions</h3>
          <div className="space-y-1 text-xs">
            <div>Technician: {reportData.technician}</div>
            <div>Date: {new Date().toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" }).replace(/,/g, '')}</div>
            <div>Order Number: {reportData.orderNumber}</div>
            <div>Indicator Asset Number: {reportData.indicatorAssetNumber}</div>
            <div>Measurement Distance: {measurementDistance} mm</div>
          </div>
        </div>
      </section>

      <footer className="mt-8 text-center text-xs">
        <p className="font-bold text-red-600">Aerotech Inc., Proprietary and Confidential</p>
      </footer>
    </div>
  );
}

    