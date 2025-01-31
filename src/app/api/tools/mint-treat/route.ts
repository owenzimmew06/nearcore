import { NextResponse } from "next/server";

export async function POST(req: Request) {
    try {
        const { channelId, receiverId, wallet } = await req.json();
        
        // Use receiverId if present, otherwise use wallet
        const targetWallet = receiverId || wallet;
        
        console.log('Received request:', { 
            channelId, 
            receiverId, 
            wallet,
            targetWallet 
        });
        
        if (!channelId || !targetWallet) {
            console.error('Missing fields:', { 
                channelId, 
                receiverId: targetWallet 
            });
            return NextResponse.json({ 
                error: "Missing required fields. Need channelId and either receiverId or wallet" 
            }, { status: 400 });
        }

        // Get channel data from storage
        const channelData = process.env.SHARDDOG_CHANNEL_DATA ? 
            JSON.parse(process.env.SHARDDOG_CHANNEL_DATA) : null;

        console.log('Channel data loaded:', {
            hasChannelData: !!channelData,
            availableChannels: channelData ? Object.keys(channelData) : [],
            requestedChannel: channelId
        });

        if (!channelData) {
            console.error('No channel data found in environment');
            return NextResponse.json({ error: "Channel configuration not found" }, { status: 400 });
        }

        // Find the specific channel's API key
        const channelApiKey = channelData[channelId]?.apiKey;

        console.log('API key check:', {
            channelFound: !!channelData[channelId],
            hasApiKey: !!channelApiKey,
            channelId
        });

        if (!channelApiKey) {
            console.error(`No API key found for channel: ${channelId}`);
            return NextResponse.json({ error: "Invalid channel ID" }, { status: 400 });
        }

        // Format wallet address if it doesn't have a valid suffix
        const formattedReceiverId = targetWallet.endsWith('.near') || targetWallet.endsWith('.testnet') 
            ? targetWallet 
            : `${targetWallet}.near`;

        console.log('Wallet formatting:', {
            original: targetWallet,
            formatted: formattedReceiverId,
            hasNearSuffix: targetWallet.endsWith('.near'),
            hasTestnetSuffix: targetWallet.endsWith('.testnet')
        });

        const baseUrl = process.env.NODE_ENV === 'development' 
            ? 'http://localhost:3001' 
            : 'https://sharddog.ai';

        const requestBody = { receiverId: formattedReceiverId };
        console.log('Making API request:', {
            url: `${baseUrl}/api/receipts/mint/${channelId}`,
            body: requestBody,
            originalInput: { receiverId, wallet },
            formattedReceiverId,
            hasApiKey: !!channelApiKey
        });

        const response = await fetch(`${baseUrl}/api/receipts/mint/${channelId}`, {
            method: 'POST',
            headers: {
                'x-api-key': channelApiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            let errorJson;
            try {
                errorJson = JSON.parse(errorText);
            } catch (e) {
                errorJson = { raw: errorText };
            }
            
            console.error('Mint treat failed:', {
                status: response.status,
                statusText: response.statusText,
                channelId,
                receiverId: formattedReceiverId,
                error: errorJson,
                headers: Object.fromEntries(response.headers.entries())
            });
            return NextResponse.json({ 
                error: errorJson.message || "Minting failed", 
                details: errorJson 
            }, { status: response.status });
        }

        const data = await response.json();
        console.log('Mint successful:', data);
        return NextResponse.json(data);
    } catch (error) {
        console.error('Mint treat error:', error);
        return NextResponse.json({ 
            error: "Internal server error",
            details: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
    }
} 