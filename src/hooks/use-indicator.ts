
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from './use-toast';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

// --- SIMULATION TOGGLE ---
// Set to true to use simulated data for testing without a physical indicator.
// Set to false for real-world use with the Web Serial API.
const IS_SIMULATION_ENABLED = false;
// -------------------------

// Serial configuration matching your Python code
const SERIAL_CONFIG = {
  baudRate: 4800,
  dataBits: 7,
  stopBits: 2,
  parity: 'even',
  flowControl: 'none'
};

/**
 * A hook to manage connection to a serial port for reading indicator data.
 * Updated to match the actual device protocol from your Python code.
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
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const setSimulationReading = useCallback((newReading: number) => {
    if (IS_SIMULATION_ENABLED) {
        simulationBaseReadingRef.current = newReading;
        setReading(newReading);
    }
  }, []);

  // Updated to use the correct device commands
  const sendCommand = useCallback(async (command: string) => {
    if (IS_SIMULATION_ENABLED) {
      toast({
        title: "Simulator Command",
        description: `Command "${command.trim()}" sent to simulator.`,
      });
      return;
    }
    
    if (connectionStatus !== 'connected' || !writerRef.current) {
      console.log("Cannot send command - not connected or no writer");
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

  // Updated polling to use the correct "?" command
  const startPolling = useCallback(() => {
    if (IS_SIMULATION_ENABLED) return;
    
    
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    // Poll for data every 125ms (8Hz to match your Python frequency)
    pollingIntervalRef.current = setInterval(async () => {
      // Check current state directly from refs instead of captured state
      if (writerRef.current) {
        try {
          const textEncoder = new TextEncoder();
          await writerRef.current.write(textEncoder.encode("?\r"));
        } catch (error) {
          console.error("Polling error:", error);
        }
      } else {
        console.log("Polling skipped - no writer available");
      }
    }, 125); // 8Hz polling rate
    
  }, []); // Remove dependencies to avoid stale closure issues

  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  const readLoop = useCallback(async () => {
    if (!portRef.current) return;
    
    try {
      readerRef.current = portRef.current.readable?.getReader();
      if (!readerRef.current) return;

      const textDecoder = new TextDecoder();
      let buffer = '';
      
      
      while (keepReadingRef.current) {
        const { value, done } = await readerRef.current.read();
        if (done) break;

        const decoded = textDecoder.decode(value, { stream: true });
        
        buffer += decoded;
        const lines = buffer.split('\r\n');
        buffer = lines.pop() || '';


        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine) {
            
            // Check for error responses first
            if (trimmedLine.startsWith("ERR")) {
              console.error("Device Error:", trimmedLine);
              toast({
                title: "Device Error",
                description: `Indicator reported: ${trimmedLine}`,
                variant: "destructive",
              });
              continue;
            }
            
            // Parse numeric response (like your Python code)
            const parsedValue = parseFloat(trimmedLine);
            if (!isNaN(parsedValue)) {
              // Convert to microns if in mm (matching your Python logic)
              const valueInMicrons = parsedValue * 1000;

              setReading(valueInMicrons);
            } else {
              console.log("Could not parse as number:", trimmedLine);
            }
          }
        }
      }
    } catch (error) {
      if (keepReadingRef.current) {
        console.error("Read loop error:", error);
        setConnectionStatus('error');
        toast({ 
          title: "Read Error", 
          description: "An error occurred reading from the indicator.", 
          variant: "destructive" 
        });
      }
    } finally {
      if (readerRef.current) {
        readerRef.current.releaseLock();
      }
    }
  }, [toast]);

  const disconnect = useCallback(async () => {
    console.log("Disconnect called");
    stopPolling();
    
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
            if (!readerRef.current.closed) {
                await readerRef.current.cancel();
                console.log("Reader cancelled");
            }
        } catch (e) {
            console.error("Could not cancel reader", e);
        } finally {
            try {
                readerRef.current.releaseLock();
            } catch (e) {
                console.error("Could not release reader lock", e);
            }
        }
        readerRef.current = null;
    }

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

  }, [toast, stopPolling]);

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
      
      console.log("Opening port with config:", SERIAL_CONFIG);
      await port.open(SERIAL_CONFIG);
      console.log("Successfully connected");
      
      writerRef.current = port.writable?.getWriter() ?? null;

      // Set connection status first
      setConnectionStatus('connected');
      
      // Initialize device with units command (MM for millimeters)
      // Use direct writer instead of sendCommand to avoid state check issues
      if (writerRef.current) {
        const textEncoder = new TextEncoder();
        await writerRef.current.write(textEncoder.encode("MM\r"));
      }
      
      toast({
        title: "Indicator Connected",
        description: "Successfully connected to the measurement indicator.",
      });
      
      // Small delay to ensure state has updated before starting polling
      setTimeout(() => {
        keepReadingRef.current = true;
        readLoop();
        startPolling();
      }, 100);

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
          description: "Could not connect to the indicator. Please check your device.",
          variant: "destructive",
        });
        setConnectionStatus('disconnected');
        console.error("Connection error:", error);
      }
    }
  }, [toast, readLoop, startPolling]);

  useEffect(() => {
    const cleanup = () => {
      stopPolling();
      if (connectionStatus === 'connected' && portRef.current) {
        disconnect();
      }
    };
    
    window.addEventListener('beforeunload', cleanup);
    
    return () => {
      window.removeEventListener('beforeunload', cleanup);
      cleanup();
    };
  }, [connectionStatus, disconnect, stopPolling]);

  return { 
    reading, 
    connect, 
    disconnect, 
    sendCommand, 
    connectionStatus, 
    isSimulation: IS_SIMULATION_ENABLED, 
    setSimulationReading 
  };
}
