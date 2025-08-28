const { NextResponse } = require('next/server');

export async function GET() {
  return NextResponse.json({ message: 'Hello world!' });
}

export const dynamic = 'force-static';
