
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
import { calculateOrthogonality } from "@/lib/calculations";
import { useToast } from "@/hooks/use-toast";
import { Logo } from "./icons/logo";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useIndicator } from "@/hooks/use-indicator";


type Step = "setup" | "squaring" | "adjustment" | "measurement" | "results";

type Measurement = {
  position: number;
  reading: number;
};

type OrthogonalityResult = {
  value: number;
  unit: "arcsec" | "μm";
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
};

const SPEC_ARCSECONDS = 5;

export function OrthoDashboard() {
  const [step, setStep] = useState<Step>("setup");
  const [travelDistance, setTravelDistance] = useState("100");
  const { 
    reading: currentReading, 
    connect, 
    disconnect, 
    connectionStatus 
  } = useIndicator();
  const [squaringMeasurements, setSquaringMeasurements] = useState<Measurement[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [finalResult, setFinalResult] = useState<OrthogonalityResult>(null);
  const [squaringZero, setSquaringZero] = useState<number | null>(null);
  const [adjustmentZero, setAdjustmentZero] = useState<number | null>(null);
  const [reportData, setReportData] = useState<ReportData>({
    technician: "Andrew T. Jung",
    axis1Serial: "643237-1-1-X",
    axis2Serial: "643237-1-1-Y",
    orderNumber: "643237",
    customerName: "Plant & Mill - Singapore",
    alignmentPartNumber: "PA5",
    artifactAssetNumber: "0346",
    indicatorAssetNumber: "05614",
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
    if(isConnected) {
      disconnect();
    }
  };

  const handleReportDataChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
        setStep("adjustment");
    } else if (step === "adjustment") {
        setAdjustmentZero(null); // Reset zero for measurement step
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
    if (step === "squaring") {
      setSquaringMeasurements([]);
      setSquaringZero(null);
      setStep("setup");
    }
    if (step === "adjustment") {
      setStep("squaring");
    }
    if (step === "measurement") {
        setMeasurements([]);
        setAdjustmentZero(null);
        setStep("adjustment");
    }
    if (step === "results") setStep("measurement");
  };

  const recordSquaringMeasurement = () => {
    const distance = parseFloat(travelDistance);
    const numMeasurements = distance > 200 ? Math.floor(distance / 100) + 1 : 2;
    const reading = squaringZero !== null ? currentReading - squaringZero : currentReading;
    
    if(squaringMeasurements.length < numMeasurements) {
        let position = 0;
        if (squaringMeasurements.length > 0) {
            position = distance > 200 ? squaringMeasurements.length * 100 : distance;
        }
        setSquaringMeasurements(prev => [...prev, { position, reading: reading }]);
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
  
  const squaringLiveReading = squaringZero !== null ? currentReading - squaringZero : currentReading;
  const adjustmentLiveReading = adjustmentZero !== null ? currentReading - adjustmentZero : currentReading;

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

              <Accordion type="multiple" defaultValue={["item-1", "item-2", "item-3", "item-4"]} className="w-full">
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
        const squaringProgress = (squaringMeasurements.length / numMeasurements) * 100;
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Step 2: Squaring Artifact to Reference Axis</CardTitle>
                    <CardDescription>
                        Use the indicator feedback to square one side of your artifact to the axis of travel.
                        Record reference readings at the specified intervals.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                     <LiveReadingCard 
                       reading={squaringLiveReading} 
                       isConnected={isConnected} 
                       onZero={() => setSquaringZero(currentReading)}
                     />
                     <div className="space-y-2">
                        <Label>Reference Progress</Label>
                        <Progress value={squaringProgress} />
                        <p className="text-sm text-center text-muted-foreground">{squaringMeasurements.length} of {numMeasurements} reference readings recorded.</p>
                    </div>
                    <div className="space-y-2">
                        <Label>Recorded Reference Readings (μm)</Label>
                        <div className="p-2 border rounded-md min-h-[50px] bg-muted/50">
                            {squaringMeasurements.map((m, i) => (
                                <p key={i}>Position {m.position}mm: <strong>{m.reading.toFixed(3)}</strong></p>
                            ))}
                        </div>
                    </div>
                </CardContent>
                <CardFooter className="justify-between">
                    <Button variant="outline" onClick={handlePrevStep}><ChevronLeft /> Back</Button>
                    {squaringMeasurements.length < numMeasurements ? (
                        <Button onClick={recordSquaringMeasurement} disabled={!isConnected || squaringZero === null}>
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
      }
      case "adjustment": {
        const liveOrthogonality = calculateOrthogonality(0, adjustmentLiveReading, distance);
        const inSpec = liveOrthogonality !== null && liveOrthogonality.unit === 'arcsec' && Math.abs(liveOrthogonality.value) <= SPEC_ARCSECONDS;
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
                reading={adjustmentLiveReading}
                orthogonality={liveOrthogonality}
                isConnected={isConnected} 
                onZero={() => setAdjustmentZero(currentReading)}
              />
              <AdjustmentBar reading={adjustmentLiveReading} travelDistance={distance} spec={SPEC_ARCSECONDS} />
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
      case "measurement": {
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
                                <p key={i}>Position {m.position}mm: <strong>{m.reading.toFixed(3)}</strong></p>
                            ))}
                        </div>
                    </div>
                </CardContent>
                <CardFooter className="justify-between">
                    <Button variant="outline" onClick={handlePrevStep}><ChevronLeft /> Back</Button>
                    {measurements.length < numMeasurements ? (
                        <Button onClick={recordMeasurement} disabled={!isConnected}>
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
      }
      case "results":
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Step 5: Results</CardTitle>
                    <CardDescription>The orthogonality measurement is complete. Review and generate your report.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle as="h3" className="text-lg font-medium">Calculated Result</CardTitle>
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
  
    const chartData = [
        { name: 'Start', direction1: 0, direction2: squaringMeasurements[0]?.reading ?? 0 },
        { name: 'End', direction1: parseFloat(travelDistance), direction2: squaringMeasurements[0]?.reading ?? 0 },
        { name: 'End', direction1: parseFloat(travelDistance), direction2: measurements[measurements.length-1]?.reading ?? 0 },
    ];
    
    // We need to exaggerate the error to make it visible on the chart
    const errorExaggeration = 1000;
    const finalMeasurement = measurements[measurements.length - 1];
    const finalReference = squaringMeasurements[0];

    const plotData = [
        // Direction 1 line (reference) - always flat on the X axis
        { x: 0, y: 0 },
        { x: parseFloat(travelDistance), y: 0 },
        // Direction 2 line (measurement)
        // Start at the same point as reference
        { x: 0, y: 0, isMeasurement: true }, 
        // The end point shows the exaggerated deviation
        { x: parseFloat(travelDistance), y: (finalMeasurement?.reading - (finalReference?.reading ?? 0)) * errorExaggeration, isMeasurement: true }
    ];

    const direction1Data = plotData.filter(p => !p.isMeasurement);
    const direction2Data = plotData.filter(p => p.isMeasurement);


  return (
    <>
      <div id="print-report" className="hidden print-block">
        <div className="p-8 font-sans bg-white text-black printable-area">
            <header className="flex flex-col items-center mb-8">
                 <svg xmlns="http://www.w3.org/2000/svg" width="200" height="40" viewBox="0 0 258.4 51.1"><path d="M129.2 24.8c-2-3.5-3.8-6.6-5.5-9.2-2.3-3.6-4.6-6.4-6.8-8.3-2.3-2-4.9-3-7.9-3-2.3 0-4.3.7-6.2 2s-3.4 3.3-4.6 5.8c-1.2 2.5-2 5.5-2.4 8.8h21.4v2h-34.1c.1 3.5.7 6.6 1.8 9.2 1.1 2.6 2.7 4.7 4.8 6.1 2.1 1.5 4.5 2.2 7.2 2.2 3.1 0 5.8-1 8.2-2.9 2.4-2 4.4-4.7 5.9-8.2l-10-5.7-1.7 3c-.7 1.2-1.5 2.2-2.4 2.9-.9.7-1.9 1-3.1 1-1.4 0-2.6-.5-3.6-1.5-1-1-1.5-2.4-1.7-4.1H88.7c.4 4.3 1.7 7.9 3.8 10.7 2.2 2.8 5 4.9 8.6 6.2 3.6 1.3 7.6 2 12 2s8.5-.7 12-2c3.5-1.3 6.3-3.4 8.6-6.2 2.2-2.8 3.6-6.4 3.8-10.7h-23.4v-2h23.4c-.4-3.3-1.2-6.2-2.4-8.7-1.2-2.6-2.9-4.6-4.9-6-2-1.4-4.4-2.1-7.1-2.1-2.5 0-4.8.8-6.8 2.3-2 1.5-3.6 3.8-4.9 6.7l11.2 6.5 2-3.5zM38.8 48.1V3h12.8v45.1h-12.8zM58 48.1V3h37.8v11.3H70.8v7.4h23.4v11.3H70.8v15.1H58zM148.8 48.1V3h12.8v33.8h25.7v11.3h-38.5zM203.4 32.7c-2-3.5-3.8-6.6-5.5-9.2-2.3-3.6-4.6-6.4-6.8-8.3-2.3-2-4.9-3-7.9-3-2.3 0-4.3.7-6.2 2s-3.4 3.3-4.6 5.8c-1.2 2.5-2 5.5-2.4 8.8h21.4v2h-34.1c.1 3.5.7 6.6 1.8 9.2 1.1 2.6 2.7 4.7 4.8 6.1 2.1 1.5 4.5 2.2 7.2 2.2 3.1 0 5.8-1 8.2-2.9 2.4-2 4.4-4.7 5.9-8.2l-10-5.7-1.7 3c-.7 1.2-1.5 2.2-2.4 2.9-.9.7-1.9 1-3.1 1-1.4 0-2.6-.5-3.6-1.5-1-1-1.5-2.4-1.7-4.1h-12.5c.4 4.3 1.7 7.9 3.8 10.7 2.2 2.8 5 4.9 8.6 6.2 3.6 1.3 7.6 2 12 2s8.5-.7 12-2c3.5-1.3 6.3-3.4 8.6-6.2 2.2-2.8 3.6-6.4 3.8-10.7h-23.4v-2h23.4c-.4-3.3-1.2-6.2-2.4-8.7-1.2-2.6-2.9-4.6-4.9-6-2-1.4-4.4-2.1-7.1-2.1-2.5 0-4.8.8-6.8 2.3-2 1.5-3.6 3.8-4.9 6.7l11.2 6.5 2-3.5zM220.2 48.1V3h12.8v33.8h25.4v11.3h-38.2zM27.5 25.1 13.7 3.3H0l20.6 30.2L13.8 48h13.7l7-10.3 7.1 10.3h13.7l-7.1-14.6L48.9 3.3H35.2l-7.7 10.5z" fill="#00ADEF"></path></svg>
                <h2 className="text-2xl mt-2 font-bold">Axis Alignment</h2>
            </header>

            <section className="w-full h-[450px] border border-gray-300 p-4 relative mb-8">
                 <ResponsiveContainer width="100%" height="100%">
                    <LineChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis 
                            type="number" 
                            dataKey="x" 
                            domain={[0, parseFloat(travelDistance)]} 
                            label={{ value: "Direction 1", position: 'insideBottom', offset: -10 }} 
                        />
                        <YAxis 
                            type="number"
                            dataKey="y"
                            label={{ value: "Direction 2", angle: -90, position: 'insideLeft' }} 
                        />
                        <Tooltip />
                        <Line data={direction1Data} dataKey="y" stroke="red" strokeWidth={2} dot={false} name="Reference" />
                        <Line data={direction2Data} dataKey="y" stroke="blue" strokeWidth={2} dot={{ stroke: 'blue', strokeWidth: 2, r: 4, fill: 'blue' }} name="Measurement" />
                    </LineChart>
                </ResponsiveContainer>
                <p className="absolute top-4 right-4 text-sm text-gray-600">Error Exaggerated {errorExaggeration}X</p>
            </section>
            
            <section className="grid grid-cols-3 gap-4 text-sm">
                <div className="p-2 border border-gray-400">
                    <h3 className="font-bold mb-2">Results</h3>
                    <p>Orthogonality = {finalResult?.value.toFixed(1)} {finalResult?.unit === "arcsec" ? "arcsec" : "µm"}</p>
                </div>
                <div className="p-2 border border-gray-400">
                    <h3 className="font-bold mb-2">Comments</h3>
                    <p>Axis 1 Serial Number: {reportData.axis1Serial}</p>
                    <p>Axis 2 Serial Number: {reportData.axis2Serial}</p>
                    <p>Order Number: {reportData.orderNumber}</p>
                    <p>Customer Name: {reportData.customerName}</p>
                    <p>Alignment Part Number: {reportData.alignmentPartNumber}</p>
                </div>
                 <div className="p-2 border border-gray-400">
                    <h3 className="font-bold mb-2">Test Conditions</h3>
                    <p>Technician: {reportData.technician}</p>
                    <p>Date: {new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-')}</p>
                    <p>Artifact Asset Number: {reportData.artifactAssetNumber}</p>
                    <p>Indicator Asset Number: {reportData.indicatorAssetNumber}</p>
                    <p>Measurement Distance: {travelDistance} mm</p>
                    <p className="mt-4">{reportData.alignmentPartNumber}: Orthogonality &lt;= 3µm over measurement distance</p>
                </div>
            </section>

             <footer className="mt-8 text-center">
                <p className="font-bold text-red-600">Aerotech Inc.,</p>
                <p className="font-bold text-red-600">Proprietary and Confidential</p>
            </footer>
        </div>
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

function LiveReadingCard({reading, isConnected, onZero, orthogonality}: {reading: number, isConnected: boolean, onZero?: () => void, orthogonality?: OrthogonalityResult}) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle as="h3" className="text-lg font-medium">Live Reading</CardTitle>
                <Zap className={cn("w-6 h-6 transition-colors", isConnected ? "text-accent" : "text-muted-foreground")} />
            </CardHeader>
            <CardContent className="flex items-center justify-center h-24 text-center">
                {orthogonality ? (
                     <p className="text-4xl font-semibold transition-colors duration-300 font-code">
                        {orthogonality.value.toFixed(2)}{" "}
                        <span className="text-xl text-muted-foreground">{orthogonality.unit}</span>
                    </p>
                ) : (
                     <p className="text-4xl font-semibold transition-colors duration-300 font-code">
                        {reading.toFixed(3)}{" "}
                        <span className="text-xl text-muted-foreground">μm</span>
                    </p>
                )}
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

function AdjustmentBar({ reading, travelDistance, spec }: { reading: number, travelDistance: number, spec: number }) {
  const result = calculateOrthogonality(0, reading, travelDistance);
  // Ensure we are comparing absolute values for the spec check
  const arcsecValue = result?.unit === 'arcsec' ? Math.abs(result.value) : (result?.unit === 'μm' ? Math.abs(calculateOrthogonality(0, result.value, travelDistance)?.value ?? 999) : 999);
  
  const maxDisplayArcsec = spec * 3; 
  // Calculate the raw deviation in microns that corresponds to the max display arcseconds
  const maxDeviationMicrons = travelDistance * Math.tan(maxDisplayArcsec / 3600 * Math.PI / 180) * 1000;
  
  // Avoid division by zero if maxDeviationMicrons is 0
  const percentage = maxDeviationMicrons !== 0 
    ? Math.max(-100, Math.min(100, (reading / maxDeviationMicrons) * 100))
    : 0;

  const inSpec = arcsecValue <= spec;

  // Position the indicator based on the percentage. 50% is the center.
  const indicatorPosition = `calc(${50 + percentage / 2}%)`;

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h3">Live Adjustment</CardTitle>
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
