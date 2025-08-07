import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { NextResponse } from 'next/server';

const xai = createOpenAI({
  baseURL: 'https://api.x.ai/v1',
  apiKey: process.env.XAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    const result = await streamText({
      model: xai('grok-beta'),
      messages,
    });
    return result.toDataStreamResponse();
  } catch (error) {
    return NextResponse.json(
      { error: 'Error processing request' },
      { status: 500 }
    );
  }
}
