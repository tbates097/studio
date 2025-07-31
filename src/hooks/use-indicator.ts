
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from './use-toast';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

// --- SIMULATION TOGGLE ---
// Set to true to use simulated data for testing without a physical indicator.
// Set to false for real-world use with the Web Serial API.
const IS_SIMULATION_ENABLED = false;
// -------------------------


/**
 * A hook to manage connection to a serial port for reading indicator data.
 * Can operate in real mode (Web Serial API) or simulation mode.
 */
export function useIndicator() {
  const { toast } = useToast();
  const [reading, setReading] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');

  const portRef = useRef<SerialPort | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const writerRef = useRef<WritableStreamDefaultWriter<any> | null>(null);
  const keepReadingRef = useRef(false);
  const simulationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const simulationBaseReadingRef = useRef(0);

  const setSimulationReading = useCallback((newReading: number) => {
    if (IS_SIMULATION_ENABLED) {
        simulationBaseReadingRef.current = newReading;
        setReading(newReading);
    }
  }, []);

  const sendCommand = useCallback(async (command: string) => {
    if (IS_SIMULATION_ENABLED) {
      console.log(`Simulated command sent: ${command.trim()}`);
      toast({
        title: "Simulator Command",
        description: `Command "${command.trim()}" sent to simulator.`,
      });
      return;
    }

    if (connectionStatus !== 'connected' || !writerRef.current) {
      toast({
        title: "Cannot Send Command",
        description: "Indicator is not connected.",
        variant: "destructive",
      });
      return;
    }
    try {
      const textEncoder = new TextEncoder();
      await writerRef.current.write(textEncoder.encode(command));
    } catch (error) {
      console.error("Error writing to port:", error);
      toast({
        title: "Command Failed",
        description: "Failed to send command to the indicator.",
        variant: "destructive",
      });
    }
  }, [connectionStatus, toast]);

  const readLoop = useCallback(async () => {
    if (!portRef.current) return;
    
    while (portRef.current.readable && keepReadingRef.current) {
        readerRef.current = portRef.current.readable.getReader();
        const textDecoder = new TextDecoder();
        let buffer = '';
        
        try {
            while (keepReadingRef.current) {
              if (!readerRef.current) {
                    // Handle the case where readerRef.current is null, perhaps by breaking the loop or logging an error
                    console.error("readerRef.current is null in readLoop");
                    break; // Or return; depending on desired error handling
                }
                const { value, done } = await readerRef.current.read();
        
                if (done) break;

                buffer += textDecoder.decode(value, { stream: true });
                const lines = buffer.split('\r\n'); // Corrected line ending

                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (trimmedLine) {
                        const parsedValue = parseFloat(trimmedLine);
                        if (!isNaN(parsedValue)) {
                            setReading(parsedValue);
                        }
                    }
                }
            }
        } catch (error) {
            if (keepReadingRef.current) {
                console.error("Read loop error:", error);
                setConnectionStatus('error');
                toast({ title: "Read Error", description: "An error occurred reading from the indicator.", variant: "destructive" });
            }
        } finally {
            if(readerRef.current){
               readerRef.current.releaseLock();
            }
        }
    }
  }, [toast]);

  const disconnect = useCallback(async () => {
    console.log("Disconnect called");
    if (IS_SIMULATION_ENABLED) {
      if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current);
        simulationIntervalRef.current = null;
      }
      setConnectionStatus('disconnected');
      setReading(0);
      toast({
        title: "Simulator Disconnected",
        description: "The connection to the indicator simulator has been closed.",
      });
      return;
    }

    keepReadingRef.current = false;

    if (writerRef.current) {
        try {
            await writerRef.current.close();
            console.log("Writer closed");
        } catch(e) {
            console.error("Could not close writer", e);
        }
        writerRef.current = null;
    }
    
    if (readerRef.current) {
        try {
            await readerRef.current.cancel();
             console.log("Reader cancelled");
        } catch (e) {
            console.error("Could not cancel reader", e);
        }
    }

    // A short delay to allow locks to be released.
    setTimeout(async () => {
        if (portRef.current) {
            try {
                await portRef.current.close();
                console.log("Port closed");
                portRef.current = null;
                setConnectionStatus('disconnected');
                setReading(0);
                 toast({
                    title: "Indicator Disconnected",
                    description: "The connection to the indicator has been closed.",
                });
            } catch (e) {
                console.error("Failed to close port", e);
                 toast({
                    title: "Disconnect Error",
                    description: "Could not close port. It may be stuck. Please unplug the device.",
                    variant: "destructive"
                });
            }
        }
    }, 100);

  }, [toast]);

  const connect = useCallback(async () => {
    if (IS_SIMULATION_ENABLED) {
        setConnectionStatus('connecting');
        setTimeout(() => {
            setConnectionStatus('connected');
            toast({
                title: "Simulator Connected",
                description: "Successfully connected to the measurement simulator.",
            });
            simulationBaseReadingRef.current = Math.random() * 10;
            if (!simulationIntervalRef.current) {
              simulationIntervalRef.current = setInterval(() => {
                  const fluctuation = (Math.random() - 0.5) * 0.01;
                  setReading(prev => prev + fluctuation);
              }, 150);
            }
        }, 1000);
        return;
    }

    if (!('serial' in navigator)) {
      toast({
        title: "Web Serial API not supported",
        description: "Please use a compatible browser like Chrome or Edge.",
        variant: "destructive",
      });
      return;
    }
    
    setConnectionStatus('connecting');
    
    try {
      const port = await navigator.serial.requestPort();
      portRef.current = port;
      
      await port.open({ baudRate: 4800, dataBits: 7, stopBits: 2, parity: 'even', flowControl: 'none' });
      
      writerRef.current = port.writable?.getWriter() ?? null;

      setConnectionStatus('connected');
      toast({
        title: "Indicator Connected",
        description: "Successfully connected to the measurement indicator.",
      });

      keepReadingRef.current = true;
      readLoop();

    } catch (error) {
      setConnectionStatus('error');
      portRef.current = null;
      if (error instanceof DOMException && error.name === 'NotFoundError') {
        setConnectionStatus('disconnected');
      } else if (error instanceof DOMException && error.name === 'InvalidStateError') {
        toast({
          title: "Connection Failed",
          description: "Port is already open. Please disconnect first.",
          variant: "destructive",
        });
        setConnectionStatus('disconnected');
      } else {
        toast({
          title: "Connection Failed",
          description: "Could not connect. Is it in use by another program?",
          variant: "destructive",
        });
        setConnectionStatus('disconnected');
        console.error(error);
      }
    }
  }, [toast, readLoop]);

  // Effect to handle cleanup on component unmount or page close
  useEffect(() => {
    const cleanup = () => {
      if (connectionStatus === 'connected' && portRef.current) {
        disconnect();
      }
    };
    
    window.addEventListener('beforeunload', cleanup);
    
    return () => {
      window.removeEventListener('beforeunload', cleanup);
      cleanup(); // Cleanup on component unmount
    };
  }, [connectionStatus, disconnect]);

  return { reading, connect, disconnect, sendCommand, connectionStatus, isSimulation: IS_SIMULATION_ENABLED, setSimulationReading };
}
