import { MealType } from "./types";

export const HERO_BACKDROP_URL =
  "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1600&q=80";

export const MEAL_EPISODE_IMAGES: Record<MealType, string> = {
  breakfast:
    "https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?auto=format&fit=crop&w=800&q=80",
  lunch:
    "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80",
  dinner:
    "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=800&q=80",
  snack:
    "https://images.unsplash.com/photo-1577805947697-89e18249d767?auto=format&fit=crop&w=800&q=80",
};

const KEYWORD_IMAGE_MAP: { keywords: string[]; url: string }[] = [
  {
    keywords: ["egg", "omelette", "bhurji", "boiled egg", "scrambled"],
    url: "https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=700&q=80",
  },
  {
    keywords: ["paneer", "cottage cheese", "tikka", "tofu", "soya", "soy", "tempeh"],
    url: "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=700&q=80",
  },
  {
    keywords: ["oat", "porridge", "muesli", "granola", "quinoa", "cereal"],
    url: "https://images.unsplash.com/photo-1517673132405-a56a62b18caf?auto=format&fit=crop&w=700&q=80",
  },
  {
    keywords: ["milk", "curd", "yogurt", "yoghurt", "lassi", "buttermilk", "chaas", "cheese"],
    url: "https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=700&q=80",
  },
  {
    keywords: ["dal", "lentil", "moong", "masoor", "toor", "urad", "sambar", "rasam"],
    url: "https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=700&q=80",
  },
  {
    keywords: ["chickpea", "chana", "rajma", "bean", "sprout", "legume", "sundal", "hummus"],
    url: "https://images.unsplash.com/photo-1515543237350-b3eea1ec8082?auto=format&fit=crop&w=700&q=80",
  },
  {
    keywords: ["chicken", "turkey", "poultry", "meat", "mutton", "steak", "biryani"],
    url: "https://images.unsplash.com/photo-1532550907401-a500c9a57435?auto=format&fit=crop&w=700&q=80",
  },
  {
    keywords: ["fish", "salmon", "tuna", "prawn", "shrimp", "seafood"],
    url: "https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=700&q=80",
  },
  {
    keywords: ["whey", "shake", "smoothie", "protein", "sattu", "supplement", "bar"],
    url: "https://images.unsplash.com/photo-1577805947697-89e18249d767?auto=format&fit=crop&w=700&q=80",
  },
  {
    keywords: ["almond", "walnut", "peanut", "cashew", "pistachio", "nut", "seed", "chia", "flax", "pumpkin"],
    url: "https://images.unsplash.com/photo-1508061253366-f7da158b6d46?auto=format&fit=crop&w=700&q=80",
  },
  {
    keywords: ["roti", "chapati", "paratha", "phulka", "bread", "toast", "dosa", "idli", "chilla", "besan"],
    url: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=700&q=80",
  },
  {
    keywords: ["rice", "pulao", "khichdi", "poha", "upma"],
    url: "https://images.unsplash.com/photo-1516684732162-798a0062be99?auto=format&fit=crop&w=700&q=80",
  },
  {
    keywords: ["spinach", "palak", "broccoli", "salad", "green", "vegetable", "sabzi", "gobi", "mushroom", "peas"],
    url: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=700&q=80",
  },
  {
    keywords: ["banana", "apple", "berry", "fruit", "mango", "orange", "papaya", "avocado"],
    url: "https://images.unsplash.com/photo-1610832958506-aa56368176cf?auto=format&fit=crop&w=700&q=80",
  },
];

const CATEGORY_IMAGE_MAP: Record<string, string> = {
  "Dairy & Eggs":
    "https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=700&q=80",
  "Legumes & Pulses":
    "https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=700&q=80",
  "Grains & Cereals":
    "https://images.unsplash.com/photo-1517673132405-a56a62b18caf?auto=format&fit=crop&w=700&q=80",
  "Nuts & Seeds":
    "https://images.unsplash.com/photo-1508061253366-f7da158b6d46?auto=format&fit=crop&w=700&q=80",
  "Vegetables & Greens":
    "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=700&q=80",
  "Meat, Fish & Poultry":
    "https://images.unsplash.com/photo-1532550907401-a500c9a57435?auto=format&fit=crop&w=700&q=80",
  "Snacks & Supplements":
    "https://images.unsplash.com/photo-1577805947697-89e18249d767?auto=format&fit=crop&w=700&q=80",
};

const DEFAULT_FOOD_IMAGE =
  "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=700&q=80";

export function getFoodPosterUrl(foodName: string, category?: string): string {
  const lower = (foodName || "").toLowerCase();
  for (const entry of KEYWORD_IMAGE_MAP) {
    if (entry.keywords.some((kw) => lower.includes(kw))) {
      return entry.url;
    }
  }
  if (category && CATEGORY_IMAGE_MAP[category]) {
    return CATEGORY_IMAGE_MAP[category];
  }
  return DEFAULT_FOOD_IMAGE;
}
