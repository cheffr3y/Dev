// Built-in question set used when Open Trivia DB is unreachable, so starting
// a game never hard-fails on a third-party outage. General knowledge with a
// culinary lean, fitting the house. Same shape OpenTDB returns after decoding.

export type RawQuestion = {
  category: string;
  difficulty: string;
  question: string;
  correct_answer: string;
  incorrect_answers: string[];
};

export const FALLBACK_QUESTIONS: RawQuestion[] = [
  {
    category: "Food & Drink",
    difficulty: "easy",
    question: "Which mother sauce is made from butter, flour, and milk?",
    correct_answer: "Béchamel",
    incorrect_answers: ["Velouté", "Espagnole", "Hollandaise"],
  },
  {
    category: "Food & Drink",
    difficulty: "easy",
    question: "What is the main ingredient in traditional guacamole?",
    correct_answer: "Avocado",
    incorrect_answers: ["Tomatillo", "Green pea", "Cucumber"],
  },
  {
    category: "Geography",
    difficulty: "easy",
    question: "Which country has the largest population in the world?",
    correct_answer: "India",
    incorrect_answers: ["China", "United States", "Indonesia"],
  },
  {
    category: "Science & Nature",
    difficulty: "easy",
    question: "What planet is known as the Red Planet?",
    correct_answer: "Mars",
    incorrect_answers: ["Venus", "Jupiter", "Mercury"],
  },
  {
    category: "General Knowledge",
    difficulty: "easy",
    question: "How many minutes are in a full week?",
    correct_answer: "10,080",
    incorrect_answers: ["7,200", "10,800", "12,040"],
  },
  {
    category: "Food & Drink",
    difficulty: "medium",
    question: "At what Fahrenheit temperature does water boil at sea level?",
    correct_answer: "212°F",
    incorrect_answers: ["200°F", "220°F", "180°F"],
  },
  {
    category: "History",
    difficulty: "medium",
    question: "In which decade did the Titanic sink?",
    correct_answer: "1910s",
    incorrect_answers: ["1900s", "1920s", "1890s"],
  },
  {
    category: "Science & Nature",
    difficulty: "medium",
    question: "What is the largest organ of the human body?",
    correct_answer: "Skin",
    incorrect_answers: ["Liver", "Lungs", "Large intestine"],
  },
  {
    category: "Food & Drink",
    difficulty: "medium",
    question: "Which cut of beef is traditionally used for filet mignon?",
    correct_answer: "Tenderloin",
    incorrect_answers: ["Ribeye", "Sirloin", "Chuck"],
  },
  {
    category: "Geography",
    difficulty: "medium",
    question: "Which river runs through Paris?",
    correct_answer: "Seine",
    incorrect_answers: ["Loire", "Rhône", "Danube"],
  },
  {
    category: "Entertainment",
    difficulty: "medium",
    question: "In the film Ratatouille, what kind of animal is the chef Remy?",
    correct_answer: "Rat",
    incorrect_answers: ["Mouse", "Rabbit", "Squirrel"],
  },
  {
    category: "General Knowledge",
    difficulty: "medium",
    question: "How many strings does a standard violin have?",
    correct_answer: "Four",
    incorrect_answers: ["Five", "Six", "Seven"],
  },
  {
    category: "Food & Drink",
    difficulty: "hard",
    question: "What is the name for the browning reaction between amino acids and sugars?",
    correct_answer: "Maillard reaction",
    incorrect_answers: ["Caramelization", "Fermentation", "Denaturation"],
  },
  {
    category: "Science & Nature",
    difficulty: "hard",
    question: "What is the only metal that is liquid at room temperature?",
    correct_answer: "Mercury",
    incorrect_answers: ["Gallium", "Sodium", "Bromine"],
  },
  {
    category: "History",
    difficulty: "hard",
    question: "Which ancient civilization built Machu Picchu?",
    correct_answer: "Inca",
    incorrect_answers: ["Aztec", "Maya", "Olmec"],
  },
  {
    category: "Geography",
    difficulty: "hard",
    question: "Which country has the most time zones, including territories?",
    correct_answer: "France",
    incorrect_answers: ["Russia", "United States", "United Kingdom"],
  },
];
