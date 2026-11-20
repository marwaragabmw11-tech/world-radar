export type DemoStory = {
  id: string;
  category: string;
  age: string;
  title: string;
  summary: string;
  source: string;
  region: string;
  isDemo: true;
};

export const demoStories: DemoStory[] = [
  {
    id: "demo-1",
    category: "GEOPOLITICS",
    age: "Illustrative",
    title: "How shifting alliances are reshaping regional diplomacy",
    summary: "A sample editorial brief showing how World Radar will connect developments, context, and source material in one place.",
    source: "World Radar demo",
    region: "Global",
    isDemo: true
  },
  {
    id: "demo-2",
    category: "ECONOMY",
    age: "Illustrative",
    title: "Trade routes, energy markets, and the next phase of global growth",
    summary: "The production feed will compare reporting from multiple publishers and keep the original publication links visible.",
    source: "World Radar demo",
    region: "Global",
    isDemo: true
  },
  {
    id: "demo-3",
    category: "SCIENCE & TECH",
    age: "Illustrative",
    title: "The emerging technologies moving from research into daily life",
    summary: "Topic clustering will help distinguish a sustained trend from a brief burst of attention or duplicated coverage.",
    source: "World Radar demo",
    region: "Global",
    isDemo: true
  }
];
