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
  Ruler,
  Link,
  Unlink,
  Calculator,
  FileText,
  Zap,
  RotateCcw,
  Check,
  ChevronLeft,
  ChevronRight,
  Settings,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { 
  calculateOrthogonality, 
  calculateSlopeFromDifferential, 
  calculateTwoPhaseOrthogonality, 
  calculateSlopeFromTwoProbes,
  calculateInitialAngle,
  calculateLeverArm,
  calculateTargetReading,
  checkTargetProgress
} from "@/lib/calculations";
import { useToast } from "@/hooks/use-toast";
import { Logo } from "./icons/logo";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useIndicator } from "@/hooks/use-indicator";
import { Slider } from "@/components/ui/slider";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";


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
  const [currentPosition, setCurrentPosition] = useState("0");
  const [probeSpacing, setProbeSpacing] = useState("30");
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
  const [squaringZero, setSquaringZero] = useState<number | null>(null);
  const [squaringResult, setSquaringResult] = useState<OrthogonalityResult>(null);
  const [adjustmentZero, setAdjustmentZero] = useState<number | null>(null);
  const [phase1ProbeAReading, setPhase1ProbeAReading] = useState<number | null>(null);
  const [phase1ZeroReading, setPhase1ZeroReading] = useState<number | null>(null);
  const [currentProbeAReading, setCurrentProbeAReading] = useState<number | null>(null);
  const [currentProbeBReading, setCurrentProbeBReading] = useState<number | null>(null);
  const [liveProbeAReading, setLiveProbeAReading] = useState<number | null>(null);
  const [liveProbeBReading, setLiveProbeBReading] = useState<number | null>(null);
  const [isLiveReadingActive, setIsLiveReadingActive] = useState(false);
  const [lastReadingPairTimestamp, setLastReadingPairTimestamp] = useState<number>(0);
  
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

  const [reportData, setReportData] = useState<ReportData>({
    technician: "Andrew T. Jung",
    axis1Serial: "643237-1-1-X",
    axis2Serial: "643237-1-1-Y",
    orderNumber: "643237",
    customerName: "Plant & Mill - Singapore",
    alignmentPartNumber: "PA5",
    artifactAssetNumber: "0346",
    indicatorAssetNumber: "05614",
    comments: "No issues to report. System meets all specifications.",
  });

  const { toast } = useToast();

  const isConnected = connectionStatus === 'connected';

  // Rapid switching for live readings
  const [currentProbeMode, setCurrentProbeMode] = useState<'A' | 'B'>('A');
  const switchingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const startRapidSwitching = useCallback(() => {
    if (!isConnected || isLiveReadingActive) return;
    
    setIsLiveReadingActive(true);
    let mode: 'A' | 'B' = 'A';
    let tempProbeAReading: number | null = null;
    
    switchingIntervalRef.current = setInterval(() => {
      if (mode === 'A') {
        sendCommand("FNC 1\r"); // Switch to Probe A
        setCurrentProbeMode('A');
        // Capture reading after small delay
        setTimeout(() => {
          tempProbeAReading = currentReadingRef.current;
          setLiveProbeAReading(tempProbeAReading);
        }, 50);
        mode = 'B';
      } else {
        sendCommand("FNC 3\r"); // Switch to Probe B  
        setCurrentProbeMode('B');
        // Capture reading after small delay
        setTimeout(() => {
          const tempProbeBReading = currentReadingRef.current;
          setLiveProbeBReading(tempProbeBReading);
          
          // Only update the pair when we have both fresh readings
          if (tempProbeAReading !== null) {
            const timestamp = Date.now();
            setLastReadingPairTimestamp(timestamp);
            console.log('🔄 Fresh reading pair captured:', {
              probeA: tempProbeAReading,
              probeB: tempProbeBReading,
              timestamp: timestamp
            });
          }
        }, 50);
        mode = 'A';
      }
    }, 200); // Switch every 200ms
  }, [isConnected, isLiveReadingActive, sendCommand, currentReadingRef]);

  const stopRapidSwitching = useCallback(() => {
    if (switchingIntervalRef.current) {
      clearInterval(switchingIntervalRef.current);
      switchingIntervalRef.current = null;
    }
    setIsLiveReadingActive(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopRapidSwitching();
  }, [stopRapidSwitching]);

  // Helper function to capture reading after switching probe mode
  const captureReadingAfterSwitch = useCallback((command: string, callback: (reading: number | null) => void) => {
    if (!isConnected) return;
    
    // Send command to switch probe mode
    sendCommand(command);
    
    // Wait for indicator to switch and capture the reading that's current at that time
    setTimeout(() => {
      // Use ref to get the most current reading value
      callback(currentReadingRef.current);
    }, 300);
  }, [isConnected, sendCommand, currentReadingRef]);

  const resetProcess = () => {
    setStep("setup");
    setSquaringMeasurements([]);
    setMeasurements([]);
    setFinalResult(null);
    setAdjustmentZero(null);
    setSquaringZero(null);
    setSquaringResult(null);
    setPhase1ProbeAReading(null);
    setPhase1ZeroReading(null);
    setCurrentProbeAReading(null);
    setCurrentProbeBReading(null);
    setLiveProbeAReading(null);
    setLiveProbeBReading(null);
    setStableLiveOrthogonality(null);
    stopRapidSwitching();
    setCurrentPosition("0");
    setProbeSpacing("30");
    
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
    
    if(isConnected) {
      disconnect();
    }
  };

  const handleReportDataChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target;
    setReportData(prev => ({ ...prev, [id]: value }));
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
        // For live adjustment workflow, we don't need multi-point measurements
        // The live feedback is handled by the liveOrthogonality calculation
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
        setSquaringMeasurements(prev => [...prev, { position, reading: currentReading }]);
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
        setMeasurements(prev => [...prev, { position, reading: currentReading }]);
    }
  };

  const handlePrint = () => window.print();
  

  
  // Two-phase approach calculations
  const twoPhaseResults = (phase1ZeroReading !== null && phase1ProbeAReading !== null && parseFloat(currentPosition) > 0)
    ? calculateTwoPhaseOrthogonality(
        phase1ZeroReading,
        phase1ProbeAReading, 
        parseFloat(currentPosition),
        currentReading, // A-B differential
        parseFloat(probeSpacing) // Use user-specified probe spacing
      )
    : null;
  
  // Stable live readings (updated less frequently to avoid rapid cycling)
  const [stableLiveOrthogonality, setStableLiveOrthogonality] = useState<{ value: number; unit: "arcsec" } | null>(null);
  
  // Update calculation every 500ms instead of every render
  useEffect(() => {
    if (!isLiveReadingActive) return;
    
    const interval = setInterval(() => {
      if (liveProbeAReading !== null && liveProbeBReading !== null && parseFloat(currentPosition) > 0) {
        const result = calculateSlopeFromTwoProbes(
          liveProbeAReading, 
          parseFloat(currentPosition), 
          liveProbeBReading, 
          parseFloat(currentPosition) + parseFloat(probeSpacing)
        );
        setStableLiveOrthogonality(result);
        console.log('🔄 Updated stable calculation:', result, 'from A:', liveProbeAReading, 'B:', liveProbeBReading);
      }
    }, 500); // Update every 500ms
    
    return () => clearInterval(interval);
    }, [isLiveReadingActive, liveProbeAReading, liveProbeBReading, currentPosition, probeSpacing]);

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

  // Use stable calculation for display
  const liveSquaringOrthogonality = stableLiveOrthogonality;
  const liveOrthogonality = stableLiveOrthogonality;
  
  // Debug logging
  console.log('🔍 === LIVE ADJUSTMENT DEBUG ===');
  console.log('🔍 currentReading (A-B differential):', currentReading);
  console.log('🔍 probeSpacing:', probeSpacing, 'parsed:', parseFloat(probeSpacing));
  console.log('🔍 Raw calculation: slope =', currentReading, '/', parseFloat(probeSpacing), '=', currentReading / parseFloat(probeSpacing), 'μm/mm');
  console.log('🔍 liveOrthogonality result:', liveOrthogonality);
  console.log('🔍 liveOrthogonality?.value:', liveOrthogonality?.value);
  console.log('🔍 === END DEBUG ===');

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
              <LiveReadingCard reading={currentReading} isConnected={isConnected} onZero={() => setSquaringMeasurements([{ position: 0, reading: currentReading }])} />
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
        const inSpec = liveOrthogonality !== null && liveOrthogonality.unit === 'arcsec' && Math.abs(liveOrthogonality.value) <= 1;
        
        return (
          <Card>
            <CardHeader>
              <CardTitle>Step 4: Mechanical Adjustment</CardTitle>
              <CardDescription>
                Using the initial slope from Phase 1 and A-B differential feedback, adjust the axis until it is within ±1 arcsecond specification.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <LiveReadingCard 
                    reading={currentReading}
                    isConnected={isConnected} 
                    label="A-B Differential"
                />
                
                    <Card>
                        <CardHeader>
                    <CardTitle as="h3" className="text-base">Carriage Position</CardTitle>
                    <CardDescription className="text-xs">Current position for two-phase calculation.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <Label htmlFor="currentPositionAdj">Current Position (mm)</Label>
                      <Input
                        id="currentPositionAdj"
                        type="number"
                        value={currentPosition}
                        onChange={(e) => setCurrentPosition(e.target.value)}
                        placeholder="0"
                      />
                    </div>
                  </CardContent>
                </Card>
                
                {isSimulation && (
                    <Card>
                        <CardHeader>
                            <CardTitle as="h3" className="text-base">Differential Simulator</CardTitle>
                            <CardDescription className="text-xs">Use this slider to simulate the A-B differential reading.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Slider
                                value={[currentReading]}
                                onValueChange={([val]) => setSimulationReading && setSimulationReading(val)}
                                min={-300}
                                max={300}
                                step={1}
                            />
                        </CardContent>
                    </Card>
                )}


                    <AdjustmentBar 
                    result={liveOrthogonality} 
                    spec={1} 
                    />
            </CardContent>
            <CardFooter className="justify-between">
              <Button variant="outline" onClick={handlePrevStep}><ChevronLeft /> Back</Button>
              <Button onClick={handleNextStep} disabled={!inSpec} className="bg-primary hover:bg-primary/90">
                  {inSpec ? "Adjustment Complete" : "Within Spec to Proceed"} <ChevronRight />
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
                    <LiveReadingCard reading={currentReading} isConnected={isConnected} onZero={() => setMeasurements([{ position: 0, reading: currentReading }])} />
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
                            <CardTitle as="h3" className="text-lg font-medium">Compensated Result</CardTitle>
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
                     <ResultChart
                        isUITier
                        travelDistance={parseFloat(measurementDistance)}
                        finalMeasurement={measurements[measurements.length - 1]}
                        referenceMeasurement={measurements[0]}
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
    onZero,
    label = "Live Reading",
}: {
    reading: number, 
    isConnected: boolean, 
    onZero?: () => void,
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
             {onZero && (
                <CardFooter>
                    <Button onClick={onZero} className="w-full" variant="outline" disabled={!isConnected}>
                        Zero Indicator
                    </Button>
                </CardFooter>
            )}
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
    isUITier = false,
}: {
    travelDistance: number,
    referenceMeasurement?: Measurement,
    finalMeasurement?: Measurement,
    isUITier?: boolean
}) {
    const measurementDistance = travelDistance.toString();
    if (!referenceMeasurement || !finalMeasurement) return null;
    
    const errorExaggeration = isUITier ? 10000 : 1000;

    const plotData = [
        { name: 'Start', reference: 0, measurement: 0 },
        { name: `End (${measurementDistance}mm)`, reference: 0, measurement: (finalMeasurement.reading - referenceMeasurement.reading) * errorExaggeration }
    ];

    const cardTitle = isUITier ? "Result Visualization" : "Axis Alignment";
    const cardDescription = isUITier ? "Visual representation of the orthogonality error." : "Error Exaggerated 1000X";

    return (
        <Card className="print-shadow-none">
            <CardHeader>
                <CardTitle as="h3" className={isUITier ? "text-lg font-medium" : "text-base font-bold text-center"}>{cardTitle}</CardTitle>
                <CardDescription className={isUITier ? "text-sm" : "text-xs text-center"}>{cardDescription}</CardDescription>
            </CardHeader>
            <CardContent className="h-64 print-p-0">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={plotData} margin={{ top: 5, right: 30, left: 30, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" label={{ value: 'Reference Axis', position: 'insideBottom', offset: -10 }} />
                        <YAxis label={{ value: `Measured Axis (μm)`, angle: -90, position: 'insideLeft', offset: -20 }} />
                        <Tooltip 
                            formatter={(value: number, name) => [`${(value / errorExaggeration).toFixed(3)} μm`, name]}
                            labelFormatter={() => ''}
                        />
                        <Legend verticalAlign="top" height={36}/>
                        <Line type="monotone" dataKey="reference" stroke="hsl(var(--muted-foreground))" strokeWidth={2} dot={{r:4, fill: 'hsl(var(--muted-foreground))'}} activeDot={{r:6}} name="Ideal Path" />
                        <Line type="monotone" dataKey="measurement" stroke="hsl(var(--primary))" strokeWidth={2} dot={{r:4, fill: 'hsl(var(--primary))'}} activeDot={{r:6}} name="Measured Path" />
                    </LineChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
}

function PrintableReport({
  reportData,
  finalResult,
  spec,
  measurementDistance,
  referenceMeasurement,
  finalMeasurement,
}: {
  reportData: ReportData;
  finalResult: OrthogonalityResult;
  spec: number;
  measurementDistance: string;
  referenceMeasurement?: Measurement;
  finalMeasurement?: Measurement;
}) {

  const resultValue = finalResult?.value ?? 0;
  const inSpec = finalResult?.unit === 'arcsec' && Math.abs(resultValue) <= spec;

  return (
    <div className="p-8 font-sans bg-white text-black printable-area flex flex-col min-h-[95vh]">
      <header className="flex items-center justify-between pb-4 mb-4 border-b border-gray-300">
        <Logo className="w-auto h-12 text-[#00ADEF]" />
        <h2 className="text-2xl font-bold text-gray-700">Axis Alignment Report</h2>
      </header>
      
      <main className="flex-1">
        <ResultChart
            travelDistance={parseFloat(measurementDistance)}
            finalMeasurement={finalMeasurement}
            referenceMeasurement={referenceMeasurement}
        />
      </main>
      
      <section className="mt-4 grid grid-cols-3 gap-4 text-xs">
        <div className="p-2 border border-gray-300 rounded">
          <h3 className="font-bold border-b border-gray-300 pb-1 mb-1">Final Result</h3>
          <div className="flex items-center justify-between">
            <span>Orthogonality:</span>
            <span className="font-bold">{finalResult ? `${resultValue.toFixed(3)} ${finalResult.unit}` : 'N/A'}</span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <span>Status:</span>
            <Badge className={cn("text-white", inSpec ? "bg-green-600" : "bg-red-600")}>
                {inSpec ? 'PASS' : 'FAIL'}
            </Badge>
          </div>
        </div>
        <div className="p-2 border border-gray-300 rounded">
            <h3 className="font-bold border-b border-gray-300 pb-1 mb-1">Test Conditions & Equipment</h3>
            <div className="grid grid-cols-2 gap-x-2">
                <span>Technician:</span><span className="font-medium">{reportData.technician}</span>
                <span>Date:</span><span className="font-medium">{new Date().toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" }).replace(/ /g, "-")}</span>
                <span>Order #:</span><span className="font-medium">{reportData.orderNumber}</span>
                <span>Customer:</span><span className="font-medium">{reportData.customerName}</span>
                <span>Artifact #:</span><span className="font-medium">{reportData.artifactAssetNumber}</span>
                <span>Indicator #:</span><span className="font-medium">{reportData.indicatorAssetNumber}</span>
            </div>
        </div>
        <div className="p-2 border border-gray-300 rounded">
            <h3 className="font-bold border-b border-gray-300 pb-1 mb-1">Comments</h3>
            <p className="text-gray-600">{reportData.comments}</p>
        </div>
      </section>

      <footer className="mt-8 text-center text-xs">
        <p className="font-bold text-red-600">Aerotech Inc., Proprietary and Confidential</p>
      </footer>
    </div>
  );
}

    