const { NeynarAPIClient, Configuration } = require("@neynar/nodejs-sdk");
require('dotenv').config();

// Ensure your NEYNAR_API_KEY is set in the .env file
const config = new Configuration({
  apiKey: process.env.NEYNAR_API_KEY,
});

if (!process.env.NEYNAR_API_KEY) {
  throw new Error("NEYNAR_API_KEY is not set");
}

const client = new NeynarAPIClient(config);

async function createWebhook() {
  try {
    console.log('🔗 Creating webhook with Neynar SDK...');
    
    // For now, use a placeholder URL - you'll need to replace this with your actual Railway URL
    const webhookUrl = process.env.RAILWAY_PUBLIC_DOMAIN || process.env.WEBHOOK_URL || 'https://your-railway-app.up.railway.app';
    
    const fullWebhookUrl = `${webhookUrl}/webhook/neynar`;
    console.log('📡 Webhook URL:', fullWebhookUrl);
    console.log('⚠️  Make sure to update the webhook URL with your actual Railway domain!');
    
    const webhook = await client.createWebhook({
      target_url: fullWebhookUrl,
      event_types: ['cast.created', 'reaction.created', 'follow.created'],
      filters: {
        // No filters - capture all events
      },
    });
    
    console.log("✅ Webhook created successfully:", webhook);
    console.log("🎯 Webhook will receive ALL events without filters");
    
  } catch (error) {
    console.error("❌ Error creating webhook:", error);
    
    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error("Response data:", error.response.data);
    }
  }
}

// Run the script
createWebhook();