/* DOM elements */
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const chatWindow = document.getElementById("chatWindow");

/* Cloudflare Worker endpoint settings */
const CLOUDFLARE_WORKER_URL = "https://loreal-bot.txh5558.workers.dev/";

// System prompt keeps the assistant focused on L'Oreal topics only.
const SYSTEM_PROMPT = `You are the L'Oreal Product Advisor chatbot.
Only answer questions related to L'Oreal products, beauty routines, beauty recommendations, and beauty-related topics.
If a question is outside that scope, politely refuse in one sentence and redirect the user to ask about L'Oreal beauty needs.
Do not answer off-topic requests, even if the user insists.
Give practical, concise guidance and ask follow-up questions when needed (skin type, hair type, goals, concerns, budget).
Never claim medical certainty. For serious skin or health concerns, suggest consulting a qualified professional.`;

// Polite message shown when the user asks an off-topic question.
const OFF_TOPIC_REPLY =
  "I can only help with L'Oreal products, beauty routines, and recommendations. Please ask me a L'Oreal beauty question.";

/* Conversation history for the Chat Completions API */
const messages = [
  {
    role: "system",
    content: SYSTEM_PROMPT,
  },
];

// Initial assistant message
appendMessage(
  "ai",
  "Hello! Ask me about L'Oreal products, routines, or recommendations.",
);

/* Utility: append one message to the chat window */
function appendMessage(sender, text) {
  const msg = document.createElement("div");
  msg.classList.add("msg", sender);

  const label = document.createElement("p");
  label.classList.add("msg-label");
  label.textContent = sender === "user" ? "You" : "L'Oreal Advisor";

  const bubble = document.createElement("div");
  bubble.classList.add("msg-bubble");
  bubble.textContent = text;

  msg.append(label, bubble);
  chatWindow.appendChild(msg);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return { msg, bubble };
}

/* Utility: tiny typing animation for the loading message */
function startTypingAnimation(element) {
  let dotCount = 0;
  element.textContent = "Thinking";

  const typingInterval = setInterval(() => {
    dotCount = (dotCount + 1) % 4;
    element.textContent = `Thinking${".".repeat(dotCount)}`;
  }, 360);

  return function stopTypingAnimation() {
    clearInterval(typingInterval);
  };
}

/* Utility: basic off-topic guard before calling the API */
function isBeautyRelatedQuestion(text) {
  const lowerText = text.toLowerCase();
  const beautyKeywords = [
    "loreal",
    "l'oréal",
    "product",
    "products",
    "routine",
    "routines",
    "recommend",
    "recommendation",
    "skincare",
    "skin care",
    "haircare",
    "hair care",
    "makeup",
    "beauty",
    "serum",
    "face",
    "facial",
    "wash",
    "washing",
    "cleanse",
    "cleansing",
    "cleanser",
    "moisturizer",
    "moisturiser",
    "toner",
    "exfoliat",
    "acne",
    "pimple",
    "breakout",
    "oily skin",
    "dry skin",
    "sensitive skin",
    "combination skin",
    "pores",
    "dark spots",
    "hyperpigmentation",
    "anti aging",
    "anti-aging",
    "wrinkle",
    "spf",
    "sunscreen",
    "foundation",
    "mascara",
    "shampoo",
    "conditioner",
  ];

  const clearlyOffTopicKeywords = [
    "football",
    "soccer",
    "basketball",
    "baseball",
    "weather",
    "stock market",
    "bitcoin",
    "crypto",
    "politics",
    "election",
    "coding",
    "javascript",
    "python",
    "math",
    "homework",
  ];

  const hasBeautyKeyword = beautyKeywords.some((keyword) =>
    lowerText.includes(keyword),
  );
  const hasClearlyOffTopicKeyword = clearlyOffTopicKeywords.some((keyword) =>
    lowerText.includes(keyword),
  );

  // Be permissive by default, and only block when the message looks clearly unrelated.
  if (hasBeautyKeyword) {
    return true;
  }

  return !hasClearlyOffTopicKeyword;
}

/* Handle form submit */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const userMessage = userInput.value.trim();
  if (!userMessage) {
    return;
  }

  // Show user message in UI
  appendMessage("user", userMessage);
  userInput.value = "";

  // Refuse unrelated questions before sending to OpenAI.
  if (!isBeautyRelatedQuestion(userMessage)) {
    appendMessage("ai", OFF_TOPIC_REPLY);
    return;
  }

  // Add user message to API history
  messages.push({
    role: "user",
    content: userMessage,
  });

  // Show temporary loading message
  const loadingMessage = appendMessage("ai", "Thinking");
  const stopTypingAnimation = startTypingAnimation(loadingMessage.bubble);

  // Disable form while waiting for the API
  userInput.disabled = true;

  const sendButton = document.getElementById("sendBtn");
  sendButton.disabled = true;

  try {
    if (
      !CLOUDFLARE_WORKER_URL ||
      CLOUDFLARE_WORKER_URL.includes("your-worker-name")
    ) {
      throw new Error(
        "Add your deployed Cloudflare Worker URL in script.js before sending messages.",
      );
    }

    // Request to your Cloudflare Worker (the Worker calls OpenAI securely).
    const response = await fetch(CLOUDFLARE_WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: messages,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMessage = data.error?.message || "Request failed.";
      throw new Error(errorMessage);
    }

    // Cloudflare note: read the assistant reply from data.choices[0].message.content
    const assistantMessage = data.choices?.[0]?.message?.content?.trim();

    if (!assistantMessage) {
      throw new Error("No response text was returned by the API.");
    }

    // Replace loading text with assistant reply
    stopTypingAnimation();
    loadingMessage.bubble.textContent = assistantMessage;

    // Save assistant response to conversation history
    messages.push({
      role: "assistant",
      content: assistantMessage,
    });
  } catch (error) {
    stopTypingAnimation();
    loadingMessage.bubble.textContent = `Error: ${error.message}`;
  } finally {
    // Re-enable form after request completes
    userInput.disabled = false;
    sendButton.disabled = false;
    userInput.focus();
  }
});
