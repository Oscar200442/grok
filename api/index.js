// api/index.js

// This is a simple Vercel Serverless Function to act as a proxy for the Grok API.
// It handles a POST request, sends a message to the Grok API, and returns the response.

const fetch = require('node-fetch');

module.exports = async (req, res) => {
    // We only want to handle POST requests.
    if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
    }

    // A prompt is required in the request body.
    if (!req.body.prompt) {
        res.status(400).json({ error: 'Prompt is required in the request body.' });
        return;
    }

    // Get the API key from the environment variables.
    // This is crucial for security! NEVER hardcode your API key.
    const apiKey = process.env.XAI_API_KEY;

    if (!apiKey) {
        res.status(500).json({ error: 'Server configuration error: XAI_API_KEY is not set.' });
        return;
    }

    try {
        // Construct the payload for the Grok API.
        const payload = {
            model: "grok-1", // You can change this to a different Grok model if needed.
            messages: [{ role: "user", content: req.body.prompt }],
        };

        // Make the API call to Grok.
        const response = await fetch('https://api.x.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}` // Use the API key from environment variables.
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        // Check for errors from the Grok API itself.
        if (data.error) {
            res.status(response.status).json({ error: `Grok API error: ${data.error.message}` });
            return;
        }

        // Return the generated text from the Grok API.
        res.status(200).json({ text: data.choices[0].message.content });

    } catch (error) {
        // Handle any unexpected errors.
        console.error('Error during API call:', error);
        res.status(500).json({ error: 'An unexpected error occurred.' });
    }
};
