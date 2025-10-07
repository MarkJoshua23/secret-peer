import Ably from "ably";
import { NextResponse } from "next/server";

const ably = new Ably.Rest(process.env.ABLY_API_KEY!);

export async function GET() {
  try {
    console.log('Generating Ably token...');
    
    const tokenRequest = await ably.auth.createTokenRequest({
      clientId: `client-${Math.random().toString(36).substr(2, 9)}`
    });

    console.log('Token request generated:', tokenRequest);
    
    // Return the entire tokenRequest object as it contains the token
    return NextResponse.json(tokenRequest);
    
  } catch (error) {
    console.error('Error creating token:', error);
    return NextResponse.json(
      { error: "Failed to create token" },
      { status: 500 }
    );
  }
}