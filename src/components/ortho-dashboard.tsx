
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Ruler,
  Play,
  Square,
  Calculator,
  FileText,
  Zap,
  RotateCcw,
  Check,
  ChevronLeft,
  ChevronRight,
  Settings,
} from "lucide-react";
import { calculateOrthogonality } from "@/lib/calculations";
import { useToast } from "@/hooks/use-toast";
import { Logo } from "./icons/logo";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type Step = "setup" | "squaring" | "adjustment" | "measurement" | "results";

type Measurement = {
  position: number;
  reading: number;
};

type OrthogonalityResult = {
  value: number;
  unit: "arcsec" | "μm";
} | null;

const SPEC_ARCSECONDS = 5;

export function OrthoDashboard() {
  const [step, setStep] = useState<Step>("setup");
  const [travelDistance, setTravelDistance] = useState("150");
  const [currentReading, setCurrentReading] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [squaringMeasurements, setSquaringMeasurements] = useState<Measurement[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [finalResult, setFinalResult] = useState<OrthogonalityResult>(null);

  const { toast } = useToast();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const startSimulation = useCallback(() => setIsRunning(true), []);
  const stopSimulation = useCallback(() => setIsRunning(false), []);

  const resetProcess = () => {
    setStep("setup");
    setTravelDistance("150");
    setCurrentReading(0);
    setIsRunning(false);
    setSquaringMeasurements([]);
    setMeasurements([]);
    setFinalResult(null);
  };

  const handleNextStep = () => {
    stopSimulation();
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
        setStep("adjustment");
    } else if (step === "adjustment") {
        setStep("measurement");
    } else if (step === "measurement") {
        const distance = parseFloat(travelDistance);
        const reading1 = squaringMeasurements[0]?.reading ?? 0;
        const reading2 = measurements[measurements.length - 1]?.reading ?? 0;
        const result = calculateOrthogonality(reading1, reading2, distance);
        setFinalResult(result);
        setStep("results");
    }
  };
  
  const handlePrevStep = () => {
    stopSimulation();
    if (step === "squaring") {
      setSquaringMeasurements([]);
      setStep("setup");
    }
    if (step === "adjustment") {
      setStep("squaring");
    }
    if (step === "measurement") {
        setMeasurements([]);
        setStep("adjustment");
    }
    if (step === "results") setStep("measurement");
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

  useEffect(() => {
    if (step === 'squaring' && squaringMeasurements.length === 0) {
        // Auto-record first squaring measurement at 0mm
        setSquaringMeasurements([{ position: 0, reading: currentReading }]);
    }
    if (step === 'measurement' && measurements.length === 0) {
        // Auto-record first measurement at 0mm
        setMeasurements([{ position: 0, reading: currentReading }]);
    }
  }, [step, currentReading]);


  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setCurrentReading(
          (prev) => prev + (Math.random() - 0.5) * 0.1
        );
      }, 500);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning]);

  const handlePrint = () => window.print();

  const renderStepContent = () => {
    const distance = parseFloat(travelDistance) || 0;
    const numMeasurements = distance > 200 ? Math.floor(distance / 100) + 1 : 2;

    switch (step) {
      case "setup":
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Step 1: Setup</CardTitle>
                    <CardDescription>Enter the total travel distance for the measurement.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Label htmlFor="distance">Total Travel Distance (mm)</Label>
                    <Input
                        id="distance"
                        type="number"
                        value={travelDistance}
                        onChange={(e) => setTravelDistance(e.target.value)}
                        placeholder="e.g., 150"
                    />
                </CardContent>
                <CardFooter className="justify-end">
                    <Button onClick={handleNextStep}>
                        Next <ChevronRight />
                    </Button>
                </CardFooter>
            </Card>
        );

      case "squaring":
        const squaringProgress = (squaringMeasurements.length / numMeasurements) * 100;
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Step 2: Squaring First Axis</CardTitle>
                    <CardDescription>
                        Use the indicator feedback to square one side of your artifact to the axis of travel.
                        Record reference readings at the specified intervals.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                     <LiveReadingCard reading={currentReading} isRunning={isRunning} onToggle={isRunning ? stopSimulation : startSimulation} />
                     <div className="space-y-2">
                        <Label>Reference Progress</Label>
                        <Progress value={squaringProgress} />
                        <p className="text-sm text-center text-muted-foreground">{squaringMeasurements.length} of {numMeasurements} reference readings recorded.</p>
                    </div>
                    <div className="space-y-2">
                        <Label>Recorded Reference Readings (μm)</Label>
                        <div className="p-2 border rounded-md min-h-[50px] bg-muted/50">
                            {squaringMeasurements.map(m => (
                                <p key={m.position}>Position {m.position}mm: <strong>{m.reading.toFixed(3)}</strong></p>
                            ))}
                        </div>
                    </div>
                </CardContent>
                <CardFooter className="justify-between">
                    <Button variant="outline" onClick={handlePrevStep}><ChevronLeft /> Back</Button>
                    {squaringMeasurements.length < numMeasurements ? (
                        <Button onClick={recordSquaringMeasurement} disabled={!isRunning}>
                            Record Ref. Reading ({squaringMeasurements.length === 0 ? '0' : (distance > 200 ? squaringMeasurements.length * 100 : distance)}mm) <Check/>
                        </Button>
                    ) : (
                        <Button onClick={handleNextStep} className="bg-primary hover:bg-primary/90">
                           Next <ChevronRight />
                        </Button>
                    )}
                </CardFooter>
            </Card>
        );

      case "adjustment":
        const orthogonality = calculateOrthogonality(0, currentReading, distance);
        const inSpec = orthogonality !== null && orthogonality.unit === 'arcsec' && Math.abs(orthogonality.value) <= SPEC_ARCSECONDS;
        return (
          <Card>
            <CardHeader>
              <CardTitle>Step 3: Mechanical Adjustment</CardTitle>
              <CardDescription>
                Zero the indicator at one end, then move to the other. Use the live feedback to adjust the axis until it is within the {SPEC_ARCSECONDS} arcsecond specification.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <LiveReadingCard 
                reading={currentReading} 
                isRunning={isRunning} 
                onToggle={isRunning ? stopSimulation : startSimulation}
                onZero={() => setCurrentReading(0)}
              />
              <AdjustmentBar reading={currentReading} travelDistance={distance} spec={SPEC_ARCSECONDS} />
            </CardContent>
            <CardFooter className="justify-between">
              <Button variant="outline" onClick={handlePrevStep}><ChevronLeft /> Back</Button>
              <Button onClick={handleNextStep} disabled={!inSpec && isRunning} className="bg-primary hover:bg-primary/90">
                  {inSpec ? "Adjustment Complete" : "Within Spec to Proceed"} <ChevronRight />
              </Button>
            </CardFooter>
          </Card>
        );

      case "measurement":
        const progress = (measurements.length / numMeasurements) * 100;
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Step 4: Orthogonality Measurement</CardTitle>
                    <CardDescription>
                        Move to the perpendicular face. Record readings at the specified intervals.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <LiveReadingCard reading={currentReading} isRunning={isRunning} onToggle={isRunning ? stopSimulation : startSimulation} />
                     <div className="space-y-2">
                        <Label>Measurement Progress</Label>
                        <Progress value={progress} />
                        <p className="text-sm text-center text-muted-foreground">{measurements.length} of {numMeasurements} measurements recorded.</p>
                    </div>
                    <div className="space-y-2">
                        <Label>Recorded Measurements (μm)</Label>
                        <div className="p-2 border rounded-md min-h-[50px] bg-muted/50">
                            {measurements.map(m => (
                                <p key={m.position}>Position {m.position}mm: <strong>{m.reading.toFixed(3)}</strong></p>
                            ))}
                        </div>
                    </div>
                </CardContent>
                <CardFooter className="justify-between">
                    <Button variant="outline" onClick={handlePrevStep}><ChevronLeft /> Back</Button>
                    {measurements.length < numMeasurements ? (
                        <Button onClick={recordMeasurement} disabled={!isRunning}>
                            Record Reading ({measurements.length === 0 ? '0' : (distance > 200 ? measurements.length * 100 : distance)}mm) <Check/>
                        </Button>
                    ) : (
                        <Button onClick={handleNextStep} className="bg-accent hover:bg-accent/90">
                            Calculate Results <ChevronRight />
                        </Button>
                    )}
                </CardFooter>
            </Card>
        );
      
      case "results":
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Step 5: Results</CardTitle>
                    <CardDescription>The orthogonality measurement is complete.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-lg font-medium">Calculated Result</CardTitle>
                            <Calculator className="w-6 h-6 text-muted-foreground" />
                        </CardHeader>
                        <CardContent className="flex flex-col items-center justify-center h-32">
                            <div className="text-6xl font-bold text-accent font-headline" aria-live="polite">
                                {finalResult ? finalResult.value.toFixed(3) : "---"}
                            </div>
                            <p className="text-lg text-muted-foreground">
                                {finalResult ? finalResult.unit : "N/A"}
                            </p>
                        </CardContent>
                    </Card>
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
      <div id="print-report" className="hidden printable-area">
        <div className="flex items-center gap-4 mb-8">
          <Logo className="w-12 h-12 text-primary" />
          <div>
            <h1 className="text-3xl font-bold font-headline text-primary">OrthoPrecision</h1>
            <p className="text-muted-foreground">Measurement Report</p>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-8">
            <Card className="print-shadow-none">
              <CardHeader><CardTitle>Setup & Reference</CardTitle></CardHeader>
              <CardContent>
                <p><strong>Travel Distance:</strong> {travelDistance} mm</p>
                 {squaringMeasurements.map(m => (
                    <p key={`squaring-${m.position}`}><strong>Ref. @ {m.position}mm:</strong> {m.reading.toFixed(3)} μm</p>
                 ))}
              </CardContent>
            </Card>
             <Card className="print-shadow-none">
              <CardHeader><CardTitle>Final Readings</CardTitle></CardHeader>
              <CardContent>
                 {measurements.map(m => (
                    <p key={`measurement-${m.position}`}><strong>Reading @ {m.position}mm:</strong> {m.reading.toFixed(3)} μm</p>
                 ))}
              </CardContent>
            </Card>
        </div>

        <Card className="mt-8 print-shadow-none">
          <CardHeader><CardTitle className="text-center">Final Result</CardTitle></CardHeader>
          <CardContent className="text-center">
            <p className="text-5xl font-bold text-accent font-headline">
              {finalResult ? finalResult.value.toFixed(3) : "N/A"}
            </p>
            <p className="text-xl text-muted-foreground">{finalResult?.unit}</p>
          </CardContent>
        </Card>
        <div className="mt-8 text-xs text-center text-muted-foreground">
            Report generated on {new Date().toLocaleString()}
        </div>
      </div>

      <div className="space-y-8">
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

function LiveReadingCard({reading, isRunning, onToggle, onZero}: {reading: number, isRunning: boolean, onToggle: () => void, onZero?: () => void}) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg font-medium">Live Reading</CardTitle>
                <Zap className={`w-6 h-6 transition-colors ${ isRunning ? "text-accent" : "text-muted-foreground"}`} />
            </CardHeader>
            <CardContent className="flex items-center justify-center h-24 text-center">
                 <p className="text-4xl font-semibold transition-colors duration-300 font-code">
                  {reading.toFixed(3)}{" "}
                  <span className="text-xl text-muted-foreground">μm</span>
                </p>
            </CardContent>
            <CardFooter className={cn("gap-2", onZero ? "grid-cols-2" : "grid-cols-1")}>
                <Button onClick={onToggle} className="w-full" variant={isRunning ? "destructive" : "default"}>
                    {isRunning ? <><Square className="mr-2" /> Stop</> : <><Play className="mr-2" /> Start</>}
                </Button>
                {onZero && (
                  <Button onClick={onZero} className="w-full" variant="outline">
                    Zero Indicator
                  </Button>
                )}
            </CardFooter>
        </Card>
    )
}

function AdjustmentBar({ reading, travelDistance, spec }: { reading: number, travelDistance: number, spec: number }) {
  const result = calculateOrthogonality(0, reading, travelDistance);
  // Ensure we are comparing absolute values for the spec check
  const arcsecValue = result?.unit === 'arcsec' ? Math.abs(result.value) : (result?.unit === 'μm' ? Math.abs(calculateOrthogonality(0, result.value, travelDistance)?.value ?? 999) : 999);
  
  const maxDisplayArcsec = spec * 3; 
  // Calculate the raw deviation in microns that corresponds to the max display arcseconds
  const maxDeviationMicrons = travelDistance * Math.tan(maxDisplayArcsec / 3600 * Math.PI / 180) * 1000;
  
  // Calculate the percentage based on the reading relative to the max deviation
  const percentage = Math.max(-100, Math.min(100, (reading / maxDeviationMicrons) * 100));

  const inSpec = arcsecValue <= spec;

  // Position the indicator based on the percentage. 50% is the center.
  const indicatorPosition = `calc(${50 + percentage / 2}%)`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live Adjustment</CardTitle>
        <CardDescription>Adjust until the indicator is in the green zone.</CardDescription>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        <div className="relative w-full h-8 bg-muted rounded-full overflow-hidden border">
          {/* Red zones on both sides */}
          <div className="absolute top-0 h-full bg-red-500/50 w-full"></div>
          {/* Green (in-spec) zone in the middle */}
          <div 
            className="absolute top-0 h-full bg-green-500/50"
            style={{ 
                left: `calc(50% - ${ (spec / maxDisplayArcsec) * 50}%)`,
                width: `${ (spec / maxDisplayArcsec) * 100}%`
            }}
          ></div>
          {/* Live indicator needle */}
          <div 
            className={cn(
              "absolute top-1/2 -translate-y-1/2 w-1.5 h-10 rounded-full transition-all duration-200 ease-linear border-2",
              inSpec ? "bg-green-400 border-green-700" : "bg-red-400 border-red-700"
            )}
            style={{ left: indicatorPosition }}
          />
        </div>
        <div className="text-center">
            <p className="font-bold text-lg">{result ? `${result.value.toFixed(2)} ${result.unit}` : 'Calculating...'}</p>
            <p className={cn("font-semibold", inSpec ? "text-green-500" : "text-red-500")}>
                {inSpec ? "✔ In Spec" : "✖ Out of Spec"}
            </p>
        </div>
      </CardContent>
    </Card>
  )
}
