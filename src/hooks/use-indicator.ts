
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

  const disconnect = useCallback(async () => {
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

    // 1. Signal the read loop to stop
    keepReadingRef.current = false;

    // 2. Cancel the reader. This will cause the read() promise to reject and exit the loop.
    if (readerRef.current) {
      try {
        await readerRef.current.cancel();
      } catch (error) {
        // Ignore cancel errors, as they are expected
      }
    }
    
    // 3. Close the writer
    if (writerRef.current) {
      try {
        if (!writerRef.current.closed) {
          await writerRef.current.close();
        }
      } catch (error) {
        console.warn("Failed to close writer:", error);
      }
    }
    
    // 4. Close the port
    if (portRef.current) {
        try {
            await portRef.current.close();
        } catch (error) {
            console.error("Failed to close port:", error);
        }
    }

    portRef.current = null;
    writerRef.current = null;
    readerRef.current = null;
    
    if (connectionStatus !== 'disconnected') {
      setConnectionStatus('disconnected');
      setReading(0);
      toast({
          title: "Indicator Disconnected",
          description: "The connection to the indicator has been closed.",
      });
    }
  }, [toast, connectionStatus]);

  const readLoop = useCallback(async (port: SerialPort) => {
    if (!port.readable) {
        console.error("Port is not readable.");
        return;
    }
    keepReadingRef.current = true;
    readerRef.current = port.readable.getReader();

    const textDecoder = new TextDecoder();
    let buffer = '';

    try {
        while (keepReadingRef.current) {
            const { value, done } = await readerRef.current.read();
            if (done || !keepReadingRef.current) {
                break; 
            }

            buffer += textDecoder.decode(value, { stream: true });
            const lines = buffer.split('\r\n');
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
        if (keepReadingRef.current) { // Only log if not an intentional disconnect
            console.error("Read loop error:", error);
            setConnectionStatus('error');
            toast({ title: "Read Error", description: "An error occurred while reading from the indicator.", variant: "destructive" });
        }
    } finally {
        if(readerRef.current) {
            readerRef.current.releaseLock();
            readerRef.current = null;
        }
    }
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
      
      await port.open({ baudRate: 9600, dataBits: 7, stopBits: 1, parity: 'even', flowControl: 'none' });
      
      writerRef.current = port.writable?.getWriter() ?? null;

      setConnectionStatus('connected');
      toast({
        title: "Indicator Connected",
        description: "Successfully connected to the measurement indicator.",
      });

      // Start the single, persistent read loop
      readLoop(port);

    } catch (error) {
      setConnectionStatus('error');
      portRef.current = null;
      if (error instanceof DOMException && error.name === 'NotFoundError') {
        // Don't show a toast if the user simply canceled the dialog
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
