// grok/api/tts.js
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialiser Gemini AI med din API-nøgle
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

module.exports = async (req, res) => {
    // Sørg for at det er en POST-anmodning
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Kun POST-anmodninger accepteres.' });
    }
    
    const { text } = req.body;
    
    if (!text) {
        return res.status(400).json({ error: 'Mangler tekst at konvertere.' });
    }

    try {
        const ttsModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-tts" });
        
        const request = {
            text: text,
            outputAudioConfig: {
                languageCode: "da-DK" // Tilføjelse af sprogindstilling
            }
        };

        // Kald Gemini TTS API og stream lyden
        const audioStream = await ttsModel.generateContentStream(request);
        
        // Sæt headeren for lydfilen
        res.setHeader('Content-Type', 'audio/wav');
        
        // Stream lyden direkte til klienten
        for await (const chunk of audioStream) {
            res.write(chunk);
        }
        res.end();

    } catch (error) {
        console.error('Fejl ved generering af tale:', error);
        res.status(500).json({ error: 'Fejl ved generering af tale.' });
    }
};
