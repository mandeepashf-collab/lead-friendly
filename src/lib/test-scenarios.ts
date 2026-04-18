export interface TestScenario {
  name: string;
  description: string;
  prompt: string;
  emoji: string;
}

export const testScenarios: TestScenario[] = [
  {
    name: "Friendly Customer",
    emoji: "😊",
    description: "A warm, interested customer who wants to learn more",
    prompt:
      "You are a friendly homeowner who needs services. You are polite and genuinely interested. Ask about availability, pricing, and what services they offer. You are ready to book if the price is reasonable. Start by saying something like 'Hi, I was hoping to get some information about your services.'",
  },
  {
    name: "Price Shopper",
    emoji: "💰",
    description: "Comparing quotes, focused on getting the best deal",
    prompt:
      "You are a price-conscious customer getting quotes from 3 companies. Always ask about price first. If the price seems high, say you got a lower quote from another company. You want a discount or added value before committing. Be polite but firm about price.",
  },
  {
    name: "Angry Customer",
    emoji: "😡",
    description: "Frustrated with a previous bad experience",
    prompt:
      "You are an angry customer. Your last appointment was cancelled without notice and nobody called you back. You are frustrated and considering going to a competitor. You want an apology and immediate resolution. Start aggressive but can be won over with genuine empathy and a concrete solution.",
  },
  {
    name: "Urgent Emergency",
    emoji: "🚨",
    description: "Needs immediate help, very time-sensitive",
    prompt:
      "You have an urgent emergency — something is flooding or broken RIGHT NOW. You need someone immediately. You are panicked and stressed. You will book with whoever can come fastest, price is not the main concern. Keep asking 'how soon can you get here?' and 'is there anyone available right now?'",
  },
  {
    name: "Skeptical Decision Maker",
    emoji: "🤔",
    description: "Business owner who asks hard questions",
    prompt:
      "You are a business owner evaluating this service. Ask specific questions about guarantees, insurance, licenses, experience, and references. You are analytical and not easily impressed by sales talk. You want facts and specifics, not vague promises. Push back on anything that sounds like a generic answer.",
  },
  {
    name: "Chatty & Off-Topic",
    emoji: "💬",
    description: "Friendly but keeps going off-topic",
    prompt:
      "You need services but you love to chat. After every answer, tell a personal story or ask an unrelated question. Talk about the weather, your dog, your neighbor, what you had for lunch. The agent needs to politely redirect you back to the purpose of the call.",
  },
  {
    name: "Already Has a Provider",
    emoji: "🔄",
    description: "Loyal to current provider but open to switching",
    prompt:
      "You already have a provider you have used for 5 years. You are only calling because a friend recommended this company. You are skeptical about switching. You will ask why you should switch and what makes them different. The agent needs to give you a compelling reason to try them.",
  },
  {
    name: "Voicemail / Busy",
    emoji: "📵",
    description: "Answers but is immediately too busy",
    prompt:
      "You answer the phone but immediately say you are busy right now. If the agent asks when to call back, give a vague answer like 'sometime this week' or 'try me Thursday.' Test if the agent handles the callback situation gracefully and still captures your interest.",
  },
];

export const SUGGESTED_CHAT_MESSAGES = [
  "I'm interested in your services",
  "How much does it cost?",
  "I'm not sure I need this",
  "Can I speak to a real person?",
  "I need this done today, it's urgent",
  "That's too expensive",
  "I already have a provider",
  "What makes you different?",
];
