// api/tts.js

// This is a Vercel Serverless Function to convert text to speech using the Gemini TTS API.
// It handles a POST request with text, and returns the audio data.

const { GoogleGenerativeAI } = require("@google/generative-ai");

// Helper function to convert raw PCM audio to a WAV file format
function pcmToWav(pcmData, sampleRate) {
    // We now receive the Int16Array directly, which is more reliable
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
    const blockAlign = (numChannels * bitsPerSample) / 8;
    const dataSize = pcmData.length * 2;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    // RIFF identifier
    writeString(view, 0, 'RIFF');
    // File size
    view.setUint32(4, 36 + dataSize, true);
    // RIFF type
    writeString(view, 8, 'WAVE');
    // format chunk identifier
    writeString(view, 12, 'fmt ');
    // format chunk length
    view.setUint32(16, 16, true);
    // sample format (1 = PCM)
    view.setUint16(20, 1, true);
    // number of channels
    view.setUint16(22, numChannels, true);
    // sample rate
    view.setUint32(24, sampleRate, true);
    // byte rate
    view.setUint32(28, byteRate, true);
    // block align
    view.setUint16(32, blockAlign, true);
    // bits per sample
    view.setUint16(34, bitsPerSample, true);
    // data chunk identifier
    writeString(view, 36, 'data');
    // data chunk length
    view.setUint32(40, dataSize, true);
    
    // Write PCM data
    for (let i = 0; i < pcmData.length; i++) {
        view.setInt16(44 + i * 2, pcmData[i], true);
    }

    return new Blob([view], { type: 'audio/wav' });
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
    }

    const textToSpeak = req.body.text;
    if (!textToSpeak) {
        res.status(400).json({ error: 'Text is required in the request body.' });
        return;
    }

    const apiKey = process.env.GEMINI_API_KEY;

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        
        const payload = {
            contents: [{ parts: [{ text: textToSpeak }] }],
            generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: "Kore" }
                    }
                }
            },
            model: "gemini-2.5-flash-preview-tts"
        };
        
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`;
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`API call failed with status: ${response.status}`);
        }

        const result = await response.json();
        const audioPart = result?.candidates?.[0]?.content?.parts?.[0];

        if (!audioPart || !audioPart.inlineData) {
            throw new Error('No audio data received from API.');
        }

        const audioData = audioPart.inlineData.data;
        const mimeType = audioPart.inlineData.mimeType;

        if (mimeType.includes('rate=')) {
            const sampleRate = parseInt(mimeType.match(/rate=(\d+)/)[1], 10);
            
            // The API returns base64-encoded PCM audio. We decode it to a Buffer.
            const pcmDataBuffer = Buffer.from(audioData, 'base64');
            
            // We then create a proper Int16Array view of the buffer's data.
            // This is crucial for correctly interpreting the 16-bit audio samples.
            const pcm16 = new Int16Array(pcmDataBuffer.buffer, pcmDataBuffer.byteOffset, pcmDataBuffer.length / 2);
            
            // We pass the corrected Int16Array to the WAV conversion function.
            const wavBlob = pcmToWav(pcm16, sampleRate);
            
            res.setHeader('Content-Type', 'audio/wav');
            res.send(Buffer.from(await wavBlob.arrayBuffer()));
        } else {
            throw new Error('Unsupported audio format.');
        }

    } catch (error) {
        console.error('Error during TTS API call:', error);
        res.status(500).json({ error: 'Failed to generate speech. Check API key and model permissions.' });
    }
};
