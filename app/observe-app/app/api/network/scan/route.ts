import { NextResponse } from 'next/server';
import ping from 'ping';

type ScanResult = {
  host: string;
  alive: boolean;
  time: number;
};

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { host } = await request.json();
    const result = await ping.promise.probe(host);
    const scanResult: ScanResult = {
      host: result.host,
      alive: result.alive,
      time: result.time === 'unknown' ? 0 : result.time
    };
    return NextResponse.json(scanResult);
  } catch (err) {
    console.error('Scan failed:', err instanceof Error ? err.message : 'Unknown error');
    return NextResponse.json({ error: 'Scan failed' }, { status: 500 });
  }
}
