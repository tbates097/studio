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
  Thermometer,
  Zap,
} from "lucide-react";
import { calculateOrthogonality } from "@/lib/calculations";
import { useToast } from "@/hooks/use-toast";
import { Logo } from "./icons/logo";

type OrthogonalityResult = {
  value: number;
  unit: "arcsec" | "μm";
} | null;

export function OrthoDashboard() {
  const [distance, setDistance] = useState("150");
  const [reading1, setReading1] = useState(0);
  const [reading2, setReading2] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<OrthogonalityResult>(null);
  const { toast } = useToast();

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const handlePrint = () => {
    window.print();
  };

  const startMeasurement = useCallback(() => {
    if (!distance || parseFloat(distance) <= 0) {
      toast({
        title: "Invalid Distance",
        description: "Please enter a valid measurement distance.",
        variant: "destructive",
      });
      return;
    }
    setIsRunning(true);
  }, [distance, toast]);

  const stopMeasurement = () => {
    setIsRunning(false);
  };

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setReading1(
          (prev) => prev + (Math.random() - 0.5) * 0.1
        );
        setReading2(
          (prev) => prev + (Math.random() - 0.5) * 0.2
        );
      }, 500);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning]);

  useEffect(() => {
    const distNum = parseFloat(distance);
    if (!isNaN(distNum) && distNum > 0) {
      const calculatedResult = calculateOrthogonality(
        reading1,
        reading2,
        distNum
      );
      setResult(calculatedResult);
    } else {
      setResult(null);
    }
  }, [reading1, reading2, distance]);

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
              <CardHeader>
                <CardTitle>Measurement Setup</CardTitle>
              </CardHeader>
              <CardContent>
                <p><strong>Distance:</strong> {distance} mm</p>
              </CardContent>
            </Card>

             <Card className="print-shadow-none">
              <CardHeader>
                <CardTitle>Final Readings</CardTitle>
              </CardHeader>
              <CardContent>
                 <p><strong>Reading 1:</strong> {reading1.toFixed(3)} μm</p>
                 <p><strong>Reading 2:</strong> {reading2.toFixed(3)} μm</p>
              </CardContent>
            </Card>
        </div>

        <Card className="mt-8 print-shadow-none">
          <CardHeader>
            <CardTitle className="text-center">Final Result</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-5xl font-bold text-accent font-headline">
              {result ? result.value.toFixed(3) : "N/A"}
            </p>
            <p className="text-xl text-muted-foreground">{result?.unit}</p>
          </CardContent>
        </Card>
        <div className="mt-8 text-xs text-center text-muted-foreground">
            Report generated on {new Date().toLocaleString()}
        </div>
      </div>

      <div className="space-y-8">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-3xl font-bold font-headline">Dashboard</h2>
            <p className="text-muted-foreground">
              Live orthogonality measurement and analysis.
            </p>
          </div>
          <Button onClick={handlePrint} variant="outline">
            <FileText className="mr-2" />
            Generate Report
          </Button>
        </div>

        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-medium font-headline">
                Measurement Setup
              </CardTitle>
              <Ruler className="w-6 h-6 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="distance">Measurement Distance (mm)</Label>
                  <Input
                    id="distance"
                    type="number"
                    value={distance}
                    onChange={(e) => setDistance(e.target.value)}
                    placeholder="e.g., 150"
                    disabled={isRunning}
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter>
              {isRunning ? (
                <Button onClick={stopMeasurement} className="w-full" variant="destructive">
                  <Square className="mr-2" />
                  Stop Measurement
                </Button>
              ) : (
                <Button onClick={startMeasurement} className="w-full bg-accent hover:bg-accent/90">
                  <Play className="mr-2" />
                  Start Measurement
                </Button>
              )}
            </CardFooter>
          </Card>

          <Card className="lg:col-span-1">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-medium font-headline">
                Live Data Stream
              </CardTitle>
              <Zap
                className={`w-6 h-6 transition-colors ${
                  isRunning ? "text-accent" : "text-muted-foreground"
                }`}
              />
            </CardHeader>
            <CardContent className="flex items-center justify-around h-32 text-center">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Reading 1</p>
                <p className="text-3xl font-semibold transition-colors duration-300 font-code">
                  {reading1.toFixed(3)}{" "}
                  <span className="text-lg text-muted-foreground">μm</span>
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Reading 2</p>
                <p className="text-3xl font-semibold transition-colors duration-300 font-code">
                  {reading2.toFixed(3)}{" "}
                  <span className="text-lg text-muted-foreground">μm</span>
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-2 lg:col-span-1">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-medium font-headline">
                Calculated Result
              </CardTitle>
              <Calculator className="w-6 h-6 text-muted-foreground" />
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center h-32">
              <div
                className="text-6xl font-bold text-accent font-headline"
                aria-live="polite"
              >
                {result ? result.value.toFixed(3) : "---"}
              </div>
              <p className="text-lg text-muted-foreground">
                {result ? result.unit : "N/A"}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
