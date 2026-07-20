// ═══════════════════════════════════════════════════════════════════════════
// YOUR OWN TRIVIA QUESTIONS — the "House Questions" category
// ═══════════════════════════════════════════════════════════════════════════
//
// Add a question by copying one of the blocks below and editing it:
//
//   {
//     category: "House",              // shown under the question, any text
//     difficulty: "easy",             // "easy" | "medium" | "hard" (label only)
//     question: "The question text?",
//     correct_answer: "The right answer",
//     incorrect_answers: ["Wrong 1", "Wrong 2", "Wrong 3"], // 1–3 of these
//   },
//
// Then commit and push to main — the site redeploys automatically. Answer
// order is shuffled per game, so don't worry about where "correct" sits.
// Pick "House Questions" as the category when starting a game to play these.
// If a game asks for more questions than exist here, it just runs shorter.

import type { RawQuestion } from "@/lib/trivia-fallback";

export const CUSTOM_QUESTIONS: RawQuestion[] = [
  {
    category: "House",
    difficulty: "easy",
    question: "What does 'mise en place' literally mean?",
    correct_answer: "Everything in its place",
    incorrect_answers: ["Ready to cook", "The setup", "Put in the pan"],
  },
  {
    category: "House",
    difficulty: "easy",
    question: "Which of these is NOT one of the five French mother sauces?",
    correct_answer: "Beurre blanc",
    incorrect_answers: ["Espagnole", "Velouté", "Tomate"],
  },
  {
    category: "House",
    difficulty: "medium",
    question: "What temperature should a kitchen walk-in cooler hold?",
    correct_answer: "Below 41°F",
    incorrect_answers: ["Below 50°F", "Exactly 32°F", "Below 45°F"],
  },
];
