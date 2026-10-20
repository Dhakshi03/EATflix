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

// High-precision keyword to photo mapping (specific dishes first, broader categories later)
const KEYWORD_IMAGE_MAP: { keywords: string[]; url: string }[] = [
  // 1. South Indian Specialties
  {
    keywords: ["dosa", "masala dosa", "ghee roast", "crispy dosa"],
    url: "https://images.unsplash.com/photo-1668236543090-82eba5ee5976?auto=format&fit=crop&w=700&q=80",
  },
  {
    keywords: ["idli", "steamed idli", "idly"],
    url: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=700&q=80",
  },
  {
    keywords: ["vada", "medu vada", "vadai"],
    url: "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=700&q=80",
  },
  {
    keywords: ["pesarattu", "chilla", "cheela", "moong dal chilla", "besan chilla"],
    url: "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=700&q=80",
  },
  {
    keywords: ["filter coffee", "coffee", "kaapi", "espresso", "latte", "cappuccino"],
    url: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=700&q=80",
  },
  {
    keywords: ["chai", "tea", "masala chai", "green tea"],
    url: "https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=700&q=80",
  },
  {
    keywords: ["biryani", "dum biryani", "hyderabadi biryani", "chicken biryani", "mutton biryani"],
    url: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=700&q=80",
  },
  {
    keywords: ["chole", "chana masala", "chickpea curry", "bhature", "chhole"],
    url: "https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?auto=format&fit=crop&w=700&q=80",
  },
  {
    keywords: ["rajma", "kidney bean", "rajma chawal"],
    url: "https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=700&q=80",
  },
  {
    keywords: ["dal makhani", "dal tadka", "yellow dal", "moong dal", "sambar", "rasam", "lentil curry"],
    url: "https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=700&q=80",
  },
  {
    keywords: ["paneer tikka", "tandoori paneer", "grilled paneer", "paneer butter masala", "paneer", "palak paneer"],
    url: "https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?auto=format&fit=crop&w=700&q=80",
  },
  {
    keywords: ["egg bhurji", "scrambled egg", "omelette", "masala egg"],
    url: "https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=700&q=80",
  },
  {
    keywords: ["boiled egg", "hard boiled", "egg white"],
    url: "https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?auto=format&fit=crop&w=700&q=80",
  },
  {
    keywords: ["chicken breast", "grilled chicken", "chicken tikka", "roast chicken", "chicken curry", "chicken"],
    url: "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=700&q=80",
  },
  {
    keywords: ["fish", "salmon", "tuna", "pomfret", "fish curry"],
    url: "https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=700&q=80",
  },
  {
    keywords: ["prawn", "shrimp", "seafood"],
    url: "https://images.unsplash.com/photo-1565680018434-b513d5e5fd47?auto=format&fit=crop&w=700&q=80",
  },
  {
    keywords: ["chaat", "bhel", "sprouts bhel", "sev puri", "pani puri", "samosa"],
    url: "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=700&q=80",
  },
  {
    keywords: ["corn", "sweet corn", "masala corn", "corn chaat"],
    url: "https://images.unsplash.com/photo-1551754655-cd27e38d2076?auto=format&fit=crop&w=700&q=80",
  },
  {
    keywords: ["whey", "protein shake", "smoothie", "protein scoop", "sattu", "creatine"],
    url: "https://images.unsplash.com/photo-1553530666-ba11a7da3888?auto=format&fit=crop&w=700&q=80",
  },
  {
    keywords: ["curd", "yogurt", "greek yogurt", "dahi", "lassi", "buttermilk", "chaas"],
    url: "https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=700&q=80",
  },
  {
    keywords: ["oat", "oatmeal", "porridge", "muesli", "granola"],
    url: "https://images.unsplash.com/photo-1517673132405-a56a62b18caf?auto=format&fit=crop&w=700&q=80",
  },
  {
    keywords: ["roti", "chapati", "paratha", "phulka", "naan", "kulcha", "bread", "toast"],
    url: "https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=700&q=80",
  },
  {
    keywords: ["rice", "brown rice", "white rice", "pulao", "khichdi", "poha", "upma"],
    url: "https://images.unsplash.com/photo-1516684732162-798a0062be99?auto=format&fit=crop&w=700&q=80",
  },
  {
    keywords: ["almond", "walnut", "peanut", "cashew", "nut", "seed", "chia", "flax", "peanut butter"],
    url: "https://images.unsplash.com/photo-1508061253366-f7da158b6d46?auto=format&fit=crop&w=700&q=80",
  },
  {
    keywords: ["soya", "soy", "tofu", "soya chunk", "meal maker", "tempeh"],
    url: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=700&q=80",
  },
  {
    keywords: ["sprout", "sprouted", "sundal", "legume", "chana", "kala chana"],
    url: "https://images.unsplash.com/photo-1515543237350-b3eea1ec8082?auto=format&fit=crop&w=700&q=80",
  },
  {
    keywords: ["spinach", "palak", "broccoli", "salad", "green", "vegetable", "sabzi", "gobi", "mushroom", "peas", "bhindi"],
    url: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=700&q=80",
  },
  {
    keywords: ["banana", "apple", "berry", "fruit", "mango", "orange", "papaya", "avocado", "watermelon"],
    url: "https://images.unsplash.com/photo-1610832958506-aa56368176cf?auto=format&fit=crop&w=700&q=80",
  },
];

const CATEGORY_IMAGE_MAP: Record<string, string> = {
  "South Indian":
    "https://images.unsplash.com/photo-1668236543090-82eba5ee5976?auto=format&fit=crop&w=700&q=80",
  "North Indian":
    "https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?auto=format&fit=crop&w=700&q=80",
  "Dairy & Eggs":
    "https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=700&q=80",
  "Legumes & Pulses":
    "https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=700&q=80",
  "Grains & Cereals":
    "https://images.unsplash.com/photo-1516684732162-798a0062be99?auto=format&fit=crop&w=700&q=80",
  "Nuts & Seeds":
    "https://images.unsplash.com/photo-1508061253366-f7da158b6d46?auto=format&fit=crop&w=700&q=80",
  "Vegetables & Greens":
    "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=700&q=80",
  "Meat, Fish & Poultry":
    "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=700&q=80",
  "Snacks & Supplements":
    "https://images.unsplash.com/photo-1553530666-ba11a7da3888?auto=format&fit=crop&w=700&q=80",
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
