export const TRAINER_SYSTEM_PROMPT = `
You are Demi, an encouraging, evidence-informed personal trainer for people at the
beginning of their fitness journey. Your job is to make getting started feel
simple, achievable, and personal.

Priorities:
- Ask for the user's goal, current activity level, available equipment, schedule,
  dietary preferences, and relevant limitations before prescribing a full plan.
- Favor sustainable foundations: progressive strength training, daily movement,
  sleep, protein and fiber-forward meals, hydration, and consistency.
- Keep recommendations specific but not overwhelming. Offer a next action and one
  or two follow-up questions.
- Be warm, direct, and non-judgmental. Celebrate effort rather than perfection.
- Never use em-dashes (—) in your responses. Use commas, colons, or restructure the sentence instead.
- Do not diagnose conditions or replace medical care. For pain, injury, pregnancy,
  eating-disorder concerns, or medical conditions, recommend an appropriate
  clinician before making a training or nutrition prescription.
`;

type CoachReply = {
  text: string;
  prompts: string[];
};

const goalPrompts = [
  "Build strength",
  "Lose body fat",
  "Feel more energetic",
  "Create a routine",
];

export function buildCoachReply(message: string): CoachReply {
  const normalized = message.toLowerCase();

  if (/pain|injur|pregnan|eating disorder|medical condition/.test(normalized)) {
    return {
      text:
        "I’m glad you mentioned that. Before we build a workout or nutrition plan, it’s best to check in with a qualified clinician or physical therapist who understands your situation. Once you have their guidance, I can help translate it into a gentle routine that fits your life.",
      prompts: ["I have clearance to exercise", "What can I safely start with?"],
    };
  }

  if (/lose|weight|fat|lean/.test(normalized)) {
    return {
      text:
        "A great starting point is three full-body strength sessions each week, easy daily walking, and meals built around protein, produce, and satisfying carbs. We’ll aim for habits you can repeat, not an extreme reset. What does a normal week of movement look like for you, and how many days can you realistically train?",
      prompts: ["I’m new to exercise", "I can train 3 days", "I have home equipment"],
    };
  }

  if (/muscle|strength|strong/.test(normalized)) {
    return {
      text:
        "Love that goal. We can start with a simple full-body plan: squat, hinge, push, pull, carry, and core. Then we'll gradually make it more challenging. Pair that with protein at each meal and enough recovery. Are you training at home or in a gym, and what equipment do you have?",
      prompts: ["I train at home", "I have a gym membership", "No equipment yet"],
    };
  }

  if (/nutrition|eat|food|diet|meal|protein/.test(normalized)) {
    return {
      text:
        "Let’s make food feel practical. A solid first move is to build each meal around a protein source, add a fruit or vegetable, and choose a carb or fat that keeps you satisfied. No foods need to be off-limits. What does a typical breakfast and dinner look like for you, and are there any dietary preferences I should respect?",
      prompts: ["I’m vegetarian", "I want quick meals", "I struggle with snacking"],
    };
  }

  return {
    text:
      "You’re in the right place. I’ll help you turn a big fitness goal into a routine that actually fits your days: workouts, nutrition, and the little habits that make both stick. What would feeling healthier or stronger change for you right now?",
    prompts: goalPrompts,
  };
}
