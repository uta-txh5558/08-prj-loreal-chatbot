// Copy this code into your Cloudflare Worker script

export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json",
    };

    // Handle CORS preflight requests
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Allow the Worker URL to be opened directly for a simple health check.
    if (request.method === "GET") {
      return new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({
          error: { message: "Only POST requests are supported." },
        }),
        { status: 405, headers: corsHeaders },
      );
    }

    // Store this secret in the Cloudflare Worker settings.
    const apiKey = env.GEMINI_API_KEY;
    const model = "gemini-3.8-flash";
    const userInput = await request.json();

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: { message: "GEMINI_API_KEY is not configured in the Worker." },
        }),
        { status: 500, headers: corsHeaders },
      );
    }

    // Gemini uses a separate system instruction and calls assistant messages "model".
    const systemMessages = (userInput.messages || [])
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n\n");

    const contents = (userInput.messages || [])
      .filter(
        (message) => message.role === "user" || message.role === "assistant",
      )
      .map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      }));

    const requestBody = {
      contents,
      generationConfig: {
        maxOutputTokens: 300,
      },
    };

    if (systemMessages) {
      requestBody.systemInstruction = {
        parts: [{ text: systemMessages }],
      };
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    if (!response.ok) {
      return new Response(JSON.stringify(data), {
        status: response.status,
        headers: corsHeaders,
      });
    }

    // Return the same response shape that script.js already expects.
    const assistantMessage = data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("")
      .trim();

    if (!assistantMessage) {
      return new Response(
        JSON.stringify({
          error: { message: "Gemini returned no response text." },
        }),
        { status: 502, headers: corsHeaders },
      );
    }

    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              role: "assistant",
              content: assistantMessage,
            },
          },
        ],
      }),
      {
        status: 200,
        headers: corsHeaders,
      },
    );
  },
};
