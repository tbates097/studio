
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
  MoveRight,
  Check,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { calculateOrthogonality } from "@/lib/calculations";
import { useToast } from "@/hooks/use-toast";
import { Logo } from "./icons/logo";
import { Progress } from "@/components/ui/progress";

type Step = "setup" | "squaring" | "measurement" | "results";

type Measurement = {
  position: number;
  reading: number;
};

type OrthogonalityResult = {
  value: number;
  unit: "arcsec" | "μm";
} | null;

export function OrthoDashboard() {
  const [step, setStep] = useState<Step>("setup");
  const [travelDistance, setTravelDistance] = useState("150");
  const [currentReading, setCurrentReading] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [squaringRef, setSquaringRef] = useState<number | null>(null);
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
    setSquaringRef(null);
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
        setSquaringRef(currentReading);
        setStep("measurement");
    } else if (step === "measurement") {
        const distance = parseFloat(travelDistance);
        const reading1 = measurements[0]?.reading ?? 0;
        const reading2 = measurements[measurements.length - 1]?.reading ?? 0;
        const result = calculateOrthogonality(reading1, reading2, distance);
        setFinalResult(result);
        setStep("results");
    }
  };
  
  const handlePrevStep = () => {
    stopSimulation();
    if (step === "squaring") setStep("setup");
    if (step === "measurement") {
        setMeasurements([]);
        setStep("squaring");
    }
    if (step === "results") setStep("measurement");
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
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Step 2: Squaring First Axis</CardTitle>
                    <CardDescription>
                        Use the indicator feedback to square one side of your artifact to the axis of travel.
                        When ready, capture the reference reading.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                     <LiveReadingCard reading={currentReading} isRunning={isRunning} onToggle={isRunning ? stopSimulation : startSimulation} />
                </CardContent>
                <CardFooter className="justify-between">
                    <Button variant="outline" onClick={handlePrevStep}><ChevronLeft /> Back</Button>
                    <Button onClick={handleNextStep} disabled={!isRunning}>
                        Set Reference & Next <ChevronRight />
                    </Button>
                </CardFooter>
            </Card>
        );

      case "measurement":
        const progress = (measurements.length / numMeasurements) * 100;
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Step 3: Orthogonality Measurement</CardTitle>
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
                    <CardTitle>Step 4: Results</CardTitle>
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
              <CardHeader><CardTitle>Setup</CardTitle></CardHeader>
              <CardContent>
                <p><strong>Travel Distance:</strong> {travelDistance} mm</p>
                <p><strong>Squaring Ref:</strong> {squaringRef?.toFixed(3)} μm</p>
              </CardContent>
            </Card>
             <Card className="print-shadow-none">
              <CardHeader><CardTitle>Final Readings</CardTitle></CardHeader>
              <CardContent>
                 {measurements.map(m => (
                    <p key={m.position}><strong>{m.position}mm Reading:</strong> {m.reading.toFixed(3)} μm</p>
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

function LiveReadingCard({reading, isRunning, onToggle}: {reading: number, isRunning: boolean, onToggle: () => void}) {
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
            <CardFooter>
                <Button onClick={onToggle} className="w-full" variant={isRunning ? "destructive" : "default"}>
                    {isRunning ? <><Square className="mr-2" /> Stop Simulation</> : <><Play className="mr-2" /> Start Simulation</>}
                </Button>
            </CardFooter>
        </Card>
    )
}

    