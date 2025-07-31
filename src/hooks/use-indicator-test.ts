
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
  const writerRef = useRef<WritableStreamDefaultWriter<any> | null>(null);
  const keepReadingRef = useRef(false);

  const readLoop = useCallback(async (port: SerialPort) => {
    while (port.readable && keepReadingRef.current) {
      readerRef.current = port.readable.getReader();
      const textDecoder = new TextDecoder();
      try {
        while (keepReadingRef.current) {
          const { value, done } = await readerRef.current.read();
          if (done) {
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
        readerRef.current?.releaseLock();
        readerRef.current = null;
        console.log("Reader lock released in readLoop.");
      }
    }
  }, []);

  const disconnect = useCallback(async () => {
    console.log("Disconnect called");
    if (!portRef.current) {
      console.log("Port is already null.");
      setConnectionStatus('disconnected');
      return;
    }

    keepReadingRef.current = false;
    
    if (readerRef.current) {
      try {
        await readerRef.current.cancel();
        console.log("Reader cancelled");
      } catch (e) {
        console.error("Could not cancel reader", e);
      }
    }

    if (writerRef.current) {
      try {
        await writerRef.current.close();
        console.log("Writer closed");
      } catch(e) {
        console.error("Could not close writer", e);
      }
      writerRef.current = null;
    }

    // A short delay to allow locks to be released.
    setTimeout(async () => {
      if (portRef.current) {
          try {
              await portRef.current.close();
              console.log("Port closed");
              portRef.current = null;
              setConnectionStatus('disconnected');
              setRawData('');
              toast({ title: 'Disconnected', description: 'Serial connection closed.' });
          } catch (e) {
              console.error("Failed to close port", e);
              setLastError(`Failed to close port: ${(e as Error).message}. Please unplug/replug the device or restart the browser.`);
              setConnectionStatus('error');
          }
      }
    }, 100);

  }, [toast]);

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

      writerRef.current = port.writable?.getWriter() ?? null;

      setConnectionStatus('connected');
      toast({ title: 'Connected!', description: `Port opened successfully.` });

      keepReadingRef.current = true;
      readLoop(port);

    } catch (error: any) {
      setLastError(error.message);
      setConnectionStatus('error');
      portRef.current = null;
      toast({ title: 'Connection Failed', description: error.message, variant: 'destructive' });
    }
  }, [toast, readLoop, disconnect]);

  const sendData = useCallback(async (data: string) => {
    if (!writerRef.current) {
      setLastError('Cannot send data: Port is not connected or not writable.');
      return;
    }

    try {
      const encoder = new TextEncoder();
      await writerRef.current.write(encoder.encode(data));
      setRawData(prev => prev + `\n> SENT: ${data}\n`);
    } catch (error: any) {
      setLastError(`Failed to send data: ${error.message}`);
    }
  }, []);

  return { connectionStatus, connect, disconnect, lastError, rawData, sendData };
}
