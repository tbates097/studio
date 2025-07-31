
"use client";

import { useState } from 'react';
import { useIndicatorTest } from '@/hooks/use-indicator-test';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { Link, Unlink, Send } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Terminal } from 'lucide-react';

export function ConnectionTester() {
  const {
    connectionStatus,
    connect,
    disconnect,
    lastError,
    rawData,
    sendData,
  } = useIndicatorTest();
  const [command, setCommand] = useState<string>('?');

  const isConnected = connectionStatus === 'connected';
  const isConnecting = connectionStatus === 'connecting';

  const handleSendCommand = () => {
    if (command && isConnected) {
      // Append carriage return as it's common for serial devices
      sendData(command + '\r');
    }
  };

  let statusColor = 'text-muted-foreground';
  if (isConnected) statusColor = 'text-green-500';
  if (connectionStatus === 'error') statusColor = 'text-red-500';
  if (isConnecting) statusColor = 'text-yellow-500';

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Serial Port Connection Test</CardTitle>
          <CardDescription>
            A minimal interface to test the Web Serial API connection to your
            indicator. Your device should be on COM4.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 border rounded-md bg-muted">
            <Label>Connection Status</Label>
            <span className={cn('font-bold', statusColor)}>
              {connectionStatus.toUpperCase()}
            </span>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={connect}
              disabled={isConnected || isConnecting}
              className="w-full"
            >
              <Link /> {isConnecting ? 'Connecting...' : 'Connect to COM4'}
            </Button>
            <Button
              onClick={() => disconnect()}
              disabled={!isConnected && !isConnecting}
              className="w-full"
              variant="outline"
            >
              <Unlink /> Disconnect
            </Button>
          </div>

          {lastError && (
            <Alert variant="destructive">
              <Terminal className="h-4 w-4" />
              <AlertTitle>Connection Error</AlertTitle>
              <AlertDescription>
                {lastError}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data Terminal</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="command-input">Send Command</Label>
            <div className="flex gap-2 mt-1">
              <Input
                id="command-input"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendCommand()}
                placeholder="Type command and press Enter"
                disabled={!isConnected}
              />
              <Button onClick={handleSendCommand} disabled={!isConnected}>
                <Send /> Send
              </Button>
            </div>
          </div>
          <div>
            <Label htmlFor="raw-data-output">Raw Data Received</Label>
            <Textarea
              id="raw-data-output"
              readOnly
              value={rawData}
              className="mt-1 font-mono h-60"
              placeholder="Waiting for data..."
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
