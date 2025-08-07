// api/index.js

// This is a Vercel Serverless Function to act as a proxy for the Google Gemini API.
// It handles a POST request, sends a message to the Gemini API, and returns the response.

const { GoogleGenerativeAI } = require("@google/generative-ai");

module.exports = async (req, res) => {
    // We only handle POST requests.
    if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
    }

    // A prompt is required in the request body.
    const userPrompt = req.body.prompt;
    if (!userPrompt) {
        res.status(400).json({ error: 'Prompt is required in the request body.' });
        return;
    }

    // Get the API key from the environment variables.
    // This is crucial for security! NEVER hardcode your API key.
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        res.status(500).json({ error: 'Server configuration error: GEMINI_API_KEY is not set.' });
        return;
    }

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash"});

        // Send the user's message to the Gemini API.
        const result = await model.generateContent(userPrompt);
        const response = await result.response;
        const text = response.text();

        // Return the generated text from the Gemini API.
        res.status(200).json({ text });

    } catch (error) {
        // Handle any unexpected errors.
        console.error('Error during API call:', error);
        res.status(500).json({ error: 'An unexpected error occurred. Check your API key and permissions.' });
    }
};
