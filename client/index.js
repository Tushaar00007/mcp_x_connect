import { config } from "dotenv";
import readline from "readline/promises";
import { GoogleGenAI } from "@google/genai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { type } from "os";

config();

let tools = [];  
const ai = new GoogleGenAI({
  apikey: process.env.GOOGLE_API_KEY,
});

const mcpClient = new Client({ // Changed from newClient to mcpClient
  name: "example-client",
  version: "1.0.0",
});

const chatHistory = [];
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

mcpClient.connect(new SSEClientTransport(new URL("http://localhost:3001/sse"))) // Fixed URL (added missing slash)
  .then(async () => {
    console.log("connected"); // Fixed typo in "connected"

    tools = (await mcpClient.listTools()).tools.map((tool) => { // Fixed variable name from tools to tool
      return {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: tool.inputSchema.type,
          properties: tool.inputSchema.properties,
          required: tool.inputSchema.required,
        },
      };
    });

    chatLoop(); // Fixed function name to match declaration
  });

async function chatLoop(toolcall) { // Added missing parameter
  if (toolcall) {
    console.log(" calling tool ", toolcall.name);

    chatHistory.push({
      role: "model",
      parts: [
        {
          text: `calling tool ${toolcall.name}`,
          type: `text`,
        },
      ],
    });

    const toolResult = await mcpClient.callTool({
      name: toolcall.name,
      arguments: toolcall.parameters,
    });

    chatHistory.push({
      role: "user",
      parts: [
        {
          text: "Tool result :" + toolResult.content[0].text, // Fixed typo in "Tool"
          type: `text`,
        },
      ],
    });
  } else {
    const question = await rl.question("Enter your question: ");

    chatHistory.push({
      role: "user",
      parts: [
        {
          text: question,
          type: `text`,
        },
      ],
    });
  }

  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: chatHistory,
    config: {
      tools: [
        {
          functionDeclarations: tools,
        },
      ],
    },
  });

  const functionCall = response.candidates[0].content.parts[0].functionCall;
  const responseText = response.candidates[0].content.parts[0].text;

  if (functionCall) {
    return chatLoop(functionCall);
  }

  chatHistory.push({
    role: "model",
    parts: [
      {
        text: responseText,
        type: "text",
      },
    ],
  });

  console.log(`AI: ${responseText}`);

  chatLoop();
}