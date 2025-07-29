
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from './use-toast';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

// --- SIMULATION TOGGLE ---
// Set to true to use simulated data for testing without a physical indicator.
// Set to false for real-world use with the Web Serial API.
const IS_SIMULATION_ENABLED = true;
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
  const keepReadingRef = useRef(false);
  const simulationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const disconnect = useCallback(async () => {
    // --- Simulation Disconnect ---
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
    
    // --- Real Disconnect ---
    keepReadingRef.current = false;

    if (readerRef.current) {
      try {
        await readerRef.current.cancel();
      } catch (error) {
        // Ignore cancel error
      }
    }

    if (portRef.current?.writable) {
        portRef.current.writable.getWriter().close();
    }
    
    if (portRef.current?.readable) {
        portRef.current.readable.getReader().releaseLock();
    }

    if (portRef.current) {
      try {
        await portRef.current.close();
      } catch (error) {
         console.warn("Error closing port:", error);
      }
    }

    portRef.current = null;
    readerRef.current = null;
    setConnectionStatus('disconnected');
    setReading(0); // Reset reading on disconnect
     toast({
        title: "Indicator Disconnected",
        description: "The connection to the indicator has been closed.",
     });
  }, [toast]);

  const readLoop = useCallback(async () => {
    if (!portRef.current || !portRef.current.readable) {
      return;
    }
    
    keepReadingRef.current = true;
    const textDecoder = new TextDecoder();
    let buffer = '';

    while (portRef.current && portRef.current.readable && keepReadingRef.current) {
      try {
        readerRef.current = portRef.current.readable.getReader();
        const { value, done } = await readerRef.current.read();

        if (done) {
          readerRef.current.releaseLock();
          break;
        }

        buffer += textDecoder.decode(value, { stream: true });
        
        const lines = buffer.split('\\r\\n');
        buffer = lines.pop() || ''; // Keep the last partial line

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine) {
            const parsedValue = parseFloat(trimmedLine);
            if (!isNaN(parsedValue)) {
              setReading(parsedValue);
            }
          }
        }

        readerRef.current.releaseLock();
        readerRef.current = null;

      } catch (error) {
        console.error("Read loop error:", error);
        toast({
            title: "Read Error",
            description: "An error occurred while reading from the indicator.",
            variant: "destructive"
        })
        break; // Exit loop on error
      }
    }
  }, [toast]);


  const connect = useCallback(async () => {
    // --- Simulation Connect ---
    if (IS_SIMULATION_ENABLED) {
        setConnectionStatus('connecting');
        setTimeout(() => {
            setConnectionStatus('connected');
            toast({
                title: "Simulator Connected",
                description: "Successfully connected to the measurement simulator.",
            });
            let baseReading = Math.random() * 10;
            simulationIntervalRef.current = setInterval(() => {
                // Simulate small fluctuations
                const fluctuation = (Math.random() - 0.5) * 0.1;
                baseReading += fluctuation;
                setReading(baseReading);
            }, 100); // Update every 100ms
        }, 1000); // Simulate connection delay
        return;
    }

    // --- Real Connect ---
    if (!('serial' in navigator)) {
      toast({
        title: "Web Serial API not supported",
        description: "Your browser does not support the Web Serial API. Please use a compatible browser like Chrome or Edge.",
        variant: "destructive",
      });
      return;
    }
    
    setConnectionStatus('connecting');
    
    try {
      const port = await navigator.serial.requestPort();
      portRef.current = port;
      
      await port.open({ baudRate: 9600 }); // Common baud rate, adjust if needed
      
      setConnectionStatus('connected');
      toast({
        title: "Indicator Connected",
        description: "Successfully connected to the measurement indicator.",
      });

      readLoop();

    } catch (error) {
      setConnectionStatus('error');
      portRef.current = null;
      if (error instanceof DOMException && error.name === 'NotFoundError') {
        toast({
          title: "Connection Canceled",
          description: "No serial port was selected.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Connection Failed",
          description: "Could not connect to the serial port. Make sure it's not in use by another program.",
          variant: "destructive",
        });
      }
    }
  }, [toast, readLoop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (connectionStatus === 'connected') {
        disconnect();
      }
    };
  }, [connectionStatus, disconnect]);

  return { reading, connect, disconnect, connectionStatus };
}
