import { NextResponse } from "next/server";

export async function POST(req: Request) {
    try {
        // Try to get parameters from both URL and body
        const url = new URL(req.url);
        const body = await req.json().catch(() => ({}));

        // Combine query params and body, preferring body values if both exist
        const title = body.title || url.searchParams.get('title');
        const description = body.description || url.searchParams.get('description');
        const mediaUrl = body.mediaUrl || url.searchParams.get('mediaUrl');
        const reference = body.reference || url.searchParams.get('reference');
        const wallet = body.wallet || url.searchParams.get('wallet');
        
        // Get the wallet from input, fallback to account ID in config
        const key = JSON.parse(process.env.BITTE_KEY || "{}");
        const userWallet = wallet || key?.accountId;
        
        if (!userWallet) {
            return NextResponse.json({ 
                error: "Wallet address required", 
                code: "WALLET_INPUT_REQUIRED",
                message: "Please provide your NEAR wallet address"
            }, { status: 400 });
        }
        
        // Add .near suffix if not present
        const formattedWallet = userWallet.endsWith('.near') ? 
            userWallet : `${userWallet}.near`;
        
        console.log('Received params:', { 
            title, 
            description, 
            mediaUrl, 
            reference, 
            wallet: formattedWallet 
        });

        // Validate inputs
        if (!title || !description || !mediaUrl || !reference) {
            return NextResponse.json({ 
                error: "Missing required fields", 
                received: { title, description, mediaUrl, reference }
            }, { status: 400 });
        }

        // Validate media URL
        if (!mediaUrl.startsWith('http')) {
            return NextResponse.json({ error: "Media URL must start with http/https" }, { status: 400 });
        }

        // Handle reference - if it's an object, stringify it properly
        let parsedReference = reference;
        try {
            if (typeof reference === 'object') {
                parsedReference = JSON.stringify(reference);
            } else if (typeof reference === 'string' && reference === '[object Object]') {
                parsedReference = JSON.stringify({ default: "reference" });
            } else if (typeof reference === 'string') {
                parsedReference = JSON.stringify(JSON.parse(reference));
            }
        } catch (e) {
            console.error('Reference parsing error:', e);
            return NextResponse.json({ 
                error: "Invalid reference format. Must be valid JSON",
                received: reference 
            }, { status: 400 });
        }

        // Sanitize the input strings
        const sanitizeString = (str: string) => {
            // Replace single quotes with double quotes and escape special characters
            return str.replace(/'/g, "''").trim();
        };

        const sanitizedTitle = sanitizeString(title);
        const sanitizedDescription = sanitizeString(description);
        const sanitizedMediaUrl = sanitizeString(mediaUrl);
        
        console.log('Sending to ShardDog:', {
            title: sanitizedTitle,
            description: sanitizedDescription,
            media: sanitizedMediaUrl,
            reference: parsedReference,
            wallet: formattedWallet
        });

        console.log('API Key being used:', process.env.SHARDDOG_MASTER_API_KEY);
        console.log('Request headers:', {
            'x-api-key': process.env.SHARDDOG_MASTER_API_KEY,
            'Content-Type': 'application/json'
        });

        const response = await fetch("https://sharddog.ai/api/receipts/create-channel", {
            method: 'POST',
            headers: {
                'x-api-key': process.env.SHARDDOG_MASTER_API_KEY!,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title: sanitizedTitle,
                description: sanitizedDescription,
                media: sanitizedMediaUrl,
                reference: parsedReference,
                wallet: formattedWallet
            })
        });

        if (!response.ok) {
            console.error('Request failed:', {
                status: response.status,
                body: await response.text(),
                sanitizedInputs: {
                    title: sanitizedTitle,
                    description: sanitizedDescription,
                    media: sanitizedMediaUrl,
                    reference: parsedReference,
                    wallet: formattedWallet
                }
            });
            const error = await response.json();
            console.error('ShardDog API error details:', {
                status: response.status,
                statusText: response.statusText,
                error,
                headers: Object.fromEntries(response.headers.entries())
            });
            return NextResponse.json({ error: error.message }, { status: response.status });
        }

        const data = await response.json();
        
        // Load existing channel data
        const existingChannelData = process.env.SHARDDOG_CHANNEL_DATA ? 
            JSON.parse(process.env.SHARDDOG_CHANNEL_DATA) : {};
            
        // Add new channel data while preserving existing channels
        const updatedChannelData = {
            ...existingChannelData,
            [data.channelId]: {
                apiKey: data.apiKey
            }
        };
        
        console.log('Updating channel data:', {
            existingChannels: Object.keys(existingChannelData),
            newChannel: data.channelId,
            totalChannels: Object.keys(updatedChannelData).length
        });
        
        // Store updated channel data
        process.env.SHARDDOG_CHANNEL_DATA = JSON.stringify(updatedChannelData);

        return NextResponse.json(data);
    } catch (error) {
        console.error('Server error:', error);
        return NextResponse.json({ 
            error: "Internal server error",
            details: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
    }
} 