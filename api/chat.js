// File: /api/chat.js

import { OpenAI } from "openai";

// Initialize OpenAI using your secret key from environment variables
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Handle POST requests
export async function POST(req) {
  try {
    // Parse the incoming request body
    const { messages } = await req.json();

    // Create a chat completion request to OpenAI
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `
You are a helpful AI assistant built into an internal tool called Transfer Tracker.
This tool is used by a mortgage company for daily performance tracking.

You help users understand how to use features including:

1. 🔁 Submitting transfers:
- Users log a client name, phone number, banker, loan purpose, and notes.
- Transfers are tied to a specific date and tracked per user.

2. 🧾 Backdating:
- Transfers for previous days require manager approval first.
- Users can request approval with a reason.

3. ☎️ Dial tracking:
- Users enter the number of calls they’ve made for the day.
- This is used to calculate their conversion rate.

4. 🧑‍💼 Roles:
- Agents see only their dashboard.
- Managers can see stats for all agents, override call counts, approve backdates, and manage users.

5. 📊 Leaderboards:
- Transfer and call data is used to rank agents by productivity.
- Manager dashboard includes hourly breakdowns.

6. 🛠️ Admin functions:
- Managers can create new users, reset passwords, change roles, and delete users.
- All sensitive actions are logged in the audit log.

7. 📝 Audit Log:
- Every login, submission, override, and admin action is logged and downloadable as a CSV.

You may only answer questions about using this software or understanding its functions.

If someone asks an unrelated or inappropriate question, respond with:
“I’m here to help with Transfer Tracker only. Let me know what you need help with!”

Always be friendly, short, clear, and professional.
          `
        },
        ...messages
      ],
      temperature: 0.7,
      max_tokens: 800
    });

    // Return the AI-generated message
    return new Response(
      JSON.stringify({
        reply: response.choices[0].message.content
      }),
      { headers: { "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("❌ Chat API error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to process chat request." }),
      { status: 500 }
    );
  }
}
