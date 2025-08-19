
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
import { calculateOrthogonality, calculateSlopeFromDifferential, calculateTwoPhaseOrthogonality } from "@/lib/calculations";
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
  const [travelDistance, setTravelDistance] = useState("100");
  const [currentPosition, setCurrentPosition] = useState("0");
  const [probeSpacing, setProbeSpacing] = useState("30");
  const { 
    reading: currentReading, 
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
    setCurrentPosition("0");
    setProbeSpacing("30");
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
        const distance = parseFloat(travelDistance);
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
    const distance = parseFloat(travelDistance);
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
    const distance = parseFloat(travelDistance);
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
  
  // Use Phase 2 (A-B differential) for both squaring and adjustment steps - ALWAYS real-time
  const liveSquaringOrthogonality = calculateSlopeFromDifferential(currentReading, parseFloat(probeSpacing));
  const liveOrthogonality = calculateSlopeFromDifferential(currentReading, parseFloat(probeSpacing));
  
  // Debug logging
  console.log('🔍 === LIVE ADJUSTMENT DEBUG ===');
  console.log('🔍 currentReading (A-B differential):', currentReading);
  console.log('🔍 probeSpacing:', probeSpacing, 'parsed:', parseFloat(probeSpacing));
  console.log('🔍 Raw calculation: slope =', currentReading, '/', parseFloat(probeSpacing), '=', currentReading / parseFloat(probeSpacing), 'μm/mm');
  console.log('🔍 liveOrthogonality result:', liveOrthogonality);
  console.log('🔍 liveOrthogonality?.value:', liveOrthogonality?.value);
  console.log('🔍 === END DEBUG ===');

  const renderStepContent = () => {
    const distance = parseFloat(travelDistance) || 0;
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
                      <Label htmlFor="travelDistance">Travel Distance (mm)</Label>
                      <Input
                        id="travelDistance"
                        type="number"
                        value={travelDistance}
                        onChange={(e) => setTravelDistance(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="probeSpacing">Probe A-B Spacing (mm)</Label>
                      <Input
                        id="probeSpacing"
                        type="number"
                        value={probeSpacing}
                        onChange={(e) => setProbeSpacing(e.target.value)}
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
        const inSpec = liveSquaringOrthogonality !== null && liveSquaringOrthogonality.unit === 'arcsec' && Math.abs(liveSquaringOrthogonality.value) <= 1;
        
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Step 2: Initial Slope Measurement</CardTitle>
                    <CardDescription>
                        Phase 1: Zero Probe A at one end, move carriage to other end, record position and Probe A reading to establish initial slope.
                        Phase 2: Set indicator to A-B differential mode for real-time adjustment feedback.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                     {/* Phase 1: Probe A + Position */}
                     <Card>
                       <CardHeader>
                         <CardTitle as="h3" className="text-base">Phase 1: Initial Slope (Probe A)</CardTitle>
                         <CardDescription className="text-xs">Zero Probe A at one end, then move carriage and record position.</CardDescription>
                       </CardHeader>
                       <CardContent className="space-y-3">
                         <LiveReadingCard 
                           reading={currentReading} 
                           isConnected={isConnected} 
                           label="Probe A Reading"
                           onZero={() => {
                             setPhase1ZeroReading(currentReading);
                             if (isSimulation && setSimulationReading) {
                               setSimulationReading(currentReading);
                             }
                           }}
                         />
                         <div className="space-y-2">
                           <Label htmlFor="currentPosition">Current Carriage Position (mm)</Label>
                           <Input
                             id="currentPosition"
                             type="number"
                             value={currentPosition}
                             onChange={(e) => setCurrentPosition(e.target.value)}
                             placeholder="0"
                           />
                         </div>
                         <Button 
                           onClick={() => setPhase1ProbeAReading(currentReading)}
                           disabled={!isConnected || parseFloat(currentPosition) <= 0}
                           className="w-full"
                         >
                           Record Probe A Reading at {currentPosition}mm
                         </Button>
                       </CardContent>
                     </Card>
                     
                     {/* Phase 2: A-B Differential */}
                     <Card>
                       <CardHeader>
                         <CardTitle as="h3" className="text-base">Phase 2: Live Adjustment (A-B Differential)</CardTitle>
                         <CardDescription className="text-xs">Set indicator to A-B mode with probes {probeSpacing}mm apart for real-time feedback.</CardDescription>
                       </CardHeader>
                       <CardContent>
                         <LiveReadingCard 
                           reading={currentReading} 
                           isConnected={isConnected} 
                           label="A-B Differential"
                         />
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
                        result={liveSquaringOrthogonality} 
                        spec={1}
                        showSpecMessage={true}
                    />

                </CardContent>
                <CardFooter className="justify-between">
                    <Button variant="outline" onClick={handlePrevStep}><ChevronLeft /> Back</Button>
                    <Button onClick={handleNextStep} disabled={!inSpec} className="bg-primary hover:bg-primary/90">
                        {inSpec ? "Proceed to Measurement" : "Within Spec to Proceed"} <ChevronRight />
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
                        travelDistance={parseFloat(travelDistance)}
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
            travelDistance={travelDistance}
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
    if (!referenceMeasurement || !finalMeasurement) return null;
    
    const errorExaggeration = isUITier ? 10000 : 1000;

    const plotData = [
        { name: 'Start', reference: 0, measurement: 0 },
        { name: `End (${travelDistance}mm)`, reference: 0, measurement: (finalMeasurement.reading - referenceMeasurement.reading) * errorExaggeration }
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
  travelDistance,
  referenceMeasurement,
  finalMeasurement,
}: {
  reportData: ReportData;
  finalResult: OrthogonalityResult;
  spec: number;
  travelDistance: string;
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
            travelDistance={parseFloat(travelDistance)}
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

    