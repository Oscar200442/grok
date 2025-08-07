// grok/api/tts.js
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialiser Gemini AI med din API-nøgle
// Nøglen skal gemmes som en miljøvariabel i Vercel
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

module.exports = async (req, res) => {
    // Sørg for at det er en POST-anmodning
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Kun POST-anmodninger accepteres.' });
    }
    
    // Hent teksten fra anmodningens body
    const { text } = req.body;
    
    if (!text) {
        return res.status(400).json({ error: 'Mangler tekst at konvertere.' });
    }

    try {
        const ttsModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-tts" });
        
        // Kald Gemini TTS API og stream lyden
        const result = await ttsModel.generateContentStream({
            contents: [{
                role: "user",
                parts: [{ text: text }]
            }]
        });

        // Sæt headeren for lydfilen
        res.setHeader('Content-Type', 'audio/wav');
        
        // Stream lyden direkte til klienten
        for await (const chunk of result.stream) {
            if (chunk.audioOutput) {
                res.write(Buffer.from(chunk.audioOutput.audio, 'base64'));
            }
        }
        res.end();

    } catch (error) {
        console.error('Fejl ved generering af tale:', error);
        res.status(500).json({ error: 'Fejl ved generering af tale.' });
    }
};
