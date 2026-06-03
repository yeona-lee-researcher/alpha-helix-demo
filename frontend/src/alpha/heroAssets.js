// Alpha-Helix 사용자 아바타(Hero) 자산 인덱스
// LeftSidebar 드롭다운/ChatPanel 어시스턴트 아바타에서 공통 사용
import heliSleep   from "../assets/heli_sleep.png";
import heliStar    from "../assets/heli_star.png";
import heliCoffee  from "../assets/heli_coffee.png";
import heliNight   from "../assets/heli_night.png";
import heliMap     from "../assets/heli_map.png";
import heliForest  from "../assets/heli_forest.png";
import heliWork    from "../assets/heli_work.png";
import heliBook    from "../assets/heli_book.png";

export const HEROES = [
  { key: "work",    label: "업무",   src: heliWork   },
  { key: "coffee",  label: "커피",   src: heliCoffee },
  { key: "book",    label: "독서",   src: heliBook   },
  { key: "star",    label: "스타",   src: heliStar   },
  { key: "map",     label: "지도",   src: heliMap    },
  { key: "forest",  label: "숲",     src: heliForest },
  { key: "night",   label: "야간",   src: heliNight  },
  { key: "sleep",   label: "수면",   src: heliSleep  },
];

const LS_KEY = "alpha.heroKey";

export function getCurrentHeroKey() {
  try { return localStorage.getItem(LS_KEY) || "work"; }
  catch { return "work"; }
}

export function getCurrentHeroSrc() {
  const k = getCurrentHeroKey();
  return (HEROES.find(h => h.key === k) || HEROES[0]).src;
}

export function setCurrentHeroKey(key) {
  try {
    localStorage.setItem(LS_KEY, key);
    window.dispatchEvent(new CustomEvent("alpha:hero-change", { detail: { key } }));
  } catch { /* ignore */ }
}

// 어시스턴트(AI 매니저) 전용 아바타 — 항상 work 고정
export const ASSISTANT_HERO_SRC = heliWork;
