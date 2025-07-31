
'use client';

import { useState, useCallback, useRef } from 'react';
import { useToast } from './use-toast';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * A simplified and robust hook for testing serial port connections.
 */
export function useIndicatorTest() {
  const { toast } = useToast();
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [lastError, setLastError] = useState<string>('');
  const [rawData, setRawData] = useState<string>('');

  const portRef = useRef<SerialPort | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const keepReadingRef = useRef(false);

  const disconnect = useCallback(async (isSilent = false) => {
    if (!portRef.current) {
        // Already disconnected
        setConnectionStatus('disconnected');
        return;
    }

    console.log("Starting disconnect process...");
    keepReadingRef.current = false;

    // Cancel any pending reads
    if (readerRef.current) {
        try {
            await readerRef.current.cancel();
            console.log("Reader cancelled.");
        } catch (error) {
            console.warn("Error cancelling reader:", error);
        }
    }
    
    // The read loop should now release its lock and exit.
    // We give it a moment before trying to close the port.
    setTimeout(async () => {
        if (portRef.current) {
            try {
                // Before closing the port, ensure writable is unlocked if it exists
                if (portRef.current.writable && portRef.current.writable.locked) {
                    await portRef.current.writable.getWriter().close();
                    console.log("Writer closed.");
                }
                await portRef.current.close();
                console.log("Port closed.");
            } catch (error) {
                console.error("Error closing port:", error);
                if (!isSilent) {
                  setLastError(`Failed to close port: ${(error as Error).message}. Please unplug/replug the device or restart the browser.`);
                }
            }
        }
        
        portRef.current = null;
        readerRef.current = null;
        setConnectionStatus('disconnected');
        setRawData('');
        if (!isSilent) {
          toast({ title: 'Disconnected', description: 'Serial connection closed.' });
        }
        console.log("Disconnect process finished.");
    }, 100);

  }, [toast]);

  const readLoop = useCallback(async (port: SerialPort) => {
    while (port.readable && keepReadingRef.current) {
      readerRef.current = port.readable.getReader();
      const textDecoder = new TextDecoder();
      try {
        while (true) {
          const { value, done } = await readerRef.current.read();
          if (done) {
            // Reader was cancelled, exit loop.
            break;
          }
          const decodedValue = textDecoder.decode(value);
          setRawData(prev => prev + decodedValue);
        }
      } catch (error) {
        if (keepReadingRef.current) {
            console.error('Read loop error:', error);
            setLastError(`Read error: ${(error as Error).message}`);
            setConnectionStatus('error');
        }
      } finally {
        readerRef.current.releaseLock();
        console.log("Reader lock released.");
      }
    }
  }, []);

  const connect = useCallback(async () => {
    if (!('serial' in navigator)) {
      setLastError('Web Serial API not supported in this browser.');
      setConnectionStatus('error');
      return;
    }

    if (portRef.current) {
      toast({ title: 'Already connected', variant: 'destructive' });
      return;
    }

    setConnectionStatus('connecting');
    setLastError('');
    setRawData('');

    try {
      const port = await navigator.serial.requestPort();
      portRef.current = port;

      await port.open({ baudRate: 9600, dataBits: 7, stopBits: 1, parity: 'even', flowControl: 'none' });

      setConnectionStatus('connected');
      toast({ title: 'Connected!', description: `Port opened successfully.` });

      keepReadingRef.current = true;
      readLoop(port);

    } catch (error: any) {
        let errorMessage = "An unknown error occurred.";
        if (error instanceof DOMException) {
            if (error.name === 'NotFoundError') {
                errorMessage = "No port was selected by the user.";
            } else if (error.name === 'InvalidStateError') {
                errorMessage = "The port is already open or being used.";
            } else {
                errorMessage = error.message;
            }
        } else if (error instanceof Error) {
            errorMessage = error.message;
        }
        
        setLastError(errorMessage);
        setConnectionStatus('error');
        portRef.current = null;
        toast({ title: 'Connection Failed', description: errorMessage, variant: 'destructive' });
    }
  }, [toast, readLoop]);

  const sendData = useCallback(async (data: string) => {
    if (!portRef.current || !portRef.current.writable) {
      setLastError('Cannot send data: Port is not connected or not writable.');
      return;
    }

    const writer = portRef.current.writable.getWriter();
    const encoder = new TextEncoder();
    try {
      await writer.write(encoder.encode(data));
      setRawData(prev => prev + `\n> SENT: ${data}\n`);
    } catch (error: any) {
      setLastError(`Failed to send data: ${error.message}`);
    } finally {
      writer.releaseLock();
    }
  }, []);

  return { connectionStatus, connect, disconnect, lastError, rawData, sendData };
}
