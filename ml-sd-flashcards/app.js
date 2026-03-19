const STORAGE_KEY = "marketplaceInterviewCoach.progress.v2";
const META_KEY = "marketplaceInterviewCoach.meta.v2";
const DAILY_NEW_LIMIT = 7;
const INTERVIEW_REVEAL_DELAY_MS = 12000;
const TODAY = getTodayString();

const DEFAULT_CARDS = [
  {
    id: "market-1",
    category: "Marketplace Diagnosis",
    question: "Ride wait times increased 20% week over week in one city. How would you investigate?",
    intuition:
      "Treat it like a marketplace bottleneck hunt. First localize where the extra delay entered the system: fewer drivers, worse matching, slower pickups, or more cancellations and rematches.",
    interview_answer:
      "I would break wait time into stages: request-to-match, match-to-arrival, and re-dispatch caused by cancellations. Then I would segment by hour, neighborhood, product type, weather, and rider cohort. I would compare supply-side changes like online drivers and acceptance rate against demand-side changes like request volume and pickup distance. My goal would be to find whether the issue is a supply shock, a matching issue, or an ETA quality problem before proposing fixes.",
    real_world_example:
      "At Uber or Lyft, a rainstorm can increase demand while traffic slows pickups, so the same headline metric can hide both supply-demand imbalance and slower driving conditions.",
    or_angle:
      "Queueing intuition helps here: longer waits usually mean arrival rate increased, service rate decreased, or both. OR thinking pushes you to locate the actual bottleneck instead of staring at the aggregate metric.",
    common_pitfall:
      "Jumping straight to 'we need more drivers' without checking whether the system is actually constrained by matching logic, traffic, or cancellations.",
    difficulty: "easy",
    unlockDay: 1,
  },
  {
    id: "market-2",
    category: "Experimentation & Product Thinking",
    question: "How would you evaluate a surge pricing change in a two-sided marketplace?",
    intuition:
      "Surge changes both rider behavior and driver behavior, so you need to measure both sides and the feedback loop between them.",
    interview_answer:
      "I would avoid a naive user-level A/B test because nearby riders and drivers interfere with each other. I would prefer geo-time or switchback randomization so treatment is assigned by market and time block. I would track rider conversion, cancellations, ETA, completed trips, driver online hours, driver earnings, and long-term retention guardrails. A successful result should improve marketplace health overall, not just extract more short-term revenue.",
    real_world_example:
      "A higher surge multiplier may improve short-term supply in downtown SF on Friday night, but if riders abandon the app or drivers chase surge and leave nearby neighborhoods empty, the system can worsen elsewhere.",
    or_angle:
      "Optimization under constraints matters because pricing is really a control lever for balancing supply and demand, not just a revenue knob.",
    common_pitfall:
      "Using only rider conversion or only gross bookings and ignoring driver behavior, spillovers, and delayed effects.",
    difficulty: "medium",
    unlockDay: 1,
  },
  {
    id: "market-3",
    category: "Resource Allocation & Incentives",
    question: "How would you design driver incentives for a city with recurring supply shortages?",
    intuition:
      "You are not just paying for more hours. You are paying for the right drivers, in the right places, at the right times.",
    interview_answer:
      "I would start by identifying when and where shortages occur and whether the problem is driver acquisition, activation, or repositioning. Then I would compare targeted incentives such as peak-hour guarantees, area-specific bonuses, or acceptance-based rewards against broad subsidies. I would evaluate not only incremental supply but also deadweight loss, cannibalization from already-active drivers, and whether behavior persists after the incentive ends. The best design nudges supply where the marketplace is genuinely constrained.",
    real_world_example:
      "If airport pickups are slow on Monday mornings but the rest of the city is healthy, a blanket citywide bonus is expensive and poorly targeted.",
    or_angle:
      "Resource allocation framing helps you think about scarce budget placement. The question is where marginal dollars produce the most marketplace relief.",
    common_pitfall:
      "Assuming any increase in online drivers is good without checking whether those drivers showed up in the constrained areas or times.",
    difficulty: "medium",
    unlockDay: 1,
  },
  {
    id: "market-4",
    category: "Matching, Queues & Flows",
    question: "Why might matching riders to the closest driver be suboptimal?",
    intuition:
      "A greedy local choice can hurt the system if it leaves other parts of the network stranded.",
    interview_answer:
      "Closest-driver matching optimizes one pair at a time, but the marketplace cares about collective wait time and future availability. A slightly farther driver for one rider may preserve better coverage for another area or prevent a worse downstream mismatch. I would explain that matching should consider travel times, batch context, and the opportunity cost of removing a driver from a neighborhood. In a live marketplace, local optimization can be globally bad.",
    real_world_example:
      "Uber’s batched matching explanation shows that waiting a few seconds can create better pairings across multiple riders and drivers than instant greedy assignment.",
    or_angle:
      "This is classic network flow intuition: optimize the whole matching graph, not just one edge.",
    common_pitfall: "Thinking the nearest resource is always the best resource.",
    difficulty: "easy",
    unlockDay: 1,
  },
  {
    id: "market-5",
    category: "Experimentation & Product Thinking",
    question: "Why can an A/B test fail in a two-sided marketplace even when the feature is good?",
    intuition:
      "Because treatment changes the environment around the control group too.",
    interview_answer:
      "In marketplaces, users are not independent. If treatment attracts more drivers to one area, the control area may lose supply and look worse, which contaminates the comparison. There can also be delayed adaptation: drivers learn, reposition, or churn over time. I would call out interference, spillovers, and temporal effects, and I would propose designs like switchbacks, cluster randomization, or market-level testing with strong guardrails.",
    real_world_example:
      "A dispatch algorithm that improves completion in one zone can starve adjacent zones, so a naive experiment overstates or understates the true effect depending on how traffic moves across boundaries.",
    or_angle:
      "Systems thinking matters because the marketplace is a coupled dynamic system rather than a collection of independent users.",
    common_pitfall:
      "Assuming standard user-level randomization is valid everywhere.",
    difficulty: "medium",
    unlockDay: 1,
  },
  {
    id: "market-6",
    category: "Marketplace Diagnosis",
    question: "Cancellations rose after a rider app UI change. How would you tell whether the UI actually caused it?",
    intuition:
      "Separate correlation from causation, then ask where in the journey behavior changed.",
    interview_answer:
      "I would compare exposed and unexposed cohorts over the same time window and look for change points in the funnel: request creation, pre-match abandonment, post-match cancellations, and completion. I would check rollout timing, device type, city mix, ETA shifts, and whether the new UI changed expectation setting rather than underlying operations. If available, I would use the rollout as a natural experiment and pair outcome analysis with session logs or replay data to see where users got confused.",
    real_world_example:
      "Uber’s Express POOL work showed that better wait-time transparency reduced post-request cancellations, so presentation can matter even when core operations stay the same.",
    or_angle:
      "Queueing intuition reminds you that perceived wait and actual wait are different levers. Both affect cancellation behavior.",
    common_pitfall:
      "Blaming the UI immediately without checking whether a simultaneous ETA deterioration or supply shortage explains the change.",
    difficulty: "medium",
    unlockDay: 1,
  },
  {
    id: "market-7",
    category: "Experimentation & Product Thinking",
    question: "What metrics would you track when launching a new matching policy?",
    intuition:
      "Track the full marketplace, not just the one metric the policy is supposed to improve.",
    interview_answer:
      "I would group metrics into rider experience, driver experience, and marketplace health. For riders, ETA, cancellations, conversion, and completion. For drivers, utilization, online earnings, idle time, and pickup distance. For marketplace health, total completed trips, regional balance, and fairness across neighborhoods or cohorts. I would also define guardrails for tail behavior because a small average gain can hide a large loss for specific areas.",
    real_world_example:
      "A ranking policy can reduce average ETA while increasing long pickups for suburban drivers or hurting service in low-density zones.",
    or_angle:
      "Optimization under constraints means every improvement should be interpreted against the resources and tradeoffs it creates elsewhere in the system.",
    common_pitfall: "Reporting a single headline win without guardrails or segmentation.",
    difficulty: "easy",
    unlockDay: 1,
  },
  {
    id: "market-8",
    category: "Marketplace Diagnosis",
    question: "A city has enough online drivers overall, but rider ETAs are still bad. What could be happening?",
    intuition:
      "Aggregate supply can look healthy while effective supply is poorly placed or poorly utilized.",
    interview_answer:
      "I would investigate spatial and temporal mismatch first. Drivers may be online but concentrated in the wrong neighborhoods, sitting on long pickups, declining certain requests, or trapped in traffic. I would also examine product mix, airport queues, and whether demand spikes are localized. The important point is that raw supply count is weaker than effective supply near active demand.",
    real_world_example:
      "On Lyft, a city can look driver-rich during a stadium event, but if demand clusters in one corridor while drivers are idle elsewhere, ETAs still rise sharply.",
    or_angle:
      "This is a resource allocation problem. Capacity is not just how much you have, but where and when you can deploy it.",
    common_pitfall:
      "Using total online drivers as proof that supply is not the issue.",
    difficulty: "easy",
    unlockDay: 2,
  },
  {
    id: "market-9",
    category: "Matching, Queues & Flows",
    question: "How would you explain queueing theory in a ride marketplace without math?",
    intuition:
      "If ride requests arrive faster than the system can serve them, waits grow quickly.",
    interview_answer:
      "I would say queueing theory gives a language for thinking about congestion. In rides, requests are arriving all the time and drivers are the service capacity. When demand runs close to or above effective supply, wait times can spike nonlinearly. That is why a small drop in driver availability or a small demand burst can create a much bigger ETA increase than people expect.",
    real_world_example:
      "Airport pickup queues are intuitive: once arrivals pile up faster than drivers can clear them, the line gets long fast and recovery is slow even after demand normalizes.",
    or_angle:
      "Queueing thinking helps you reason about bottlenecks, utilization, and why averages can be misleading during peak periods.",
    common_pitfall:
      "Treating wait time as if it should move linearly with demand.",
    difficulty: "easy",
    unlockDay: 2,
  },
  {
    id: "market-10",
    category: "Experimentation & Product Thinking",
    question: "How would you evaluate a feature that promises to reduce pickup cancellations by showing more ETA detail?",
    intuition:
      "The idea is not just to improve information. It is to shift expectation and behavior.",
    interview_answer:
      "I would test whether the feature changes cancellations, conversion, and trust metrics, and I would segment heavily by ETA bucket because transparency matters most when waits are uncomfortable. I would also check whether the feature changes post-request behavior differently for riders with and without alternative transport options. If the change works, I would expect the biggest gains in cases where uncertainty and idleness were part of the problem, not necessarily where operations were already smooth.",
    real_world_example:
      "Uber described an Express POOL test where clearer progress during waiting reduced post-request cancellations.",
    or_angle:
      "OR helps by separating actual service time from perceived queue experience. Good systems manage both.",
    common_pitfall:
      "Only checking average cancellation rate without understanding which wait states are affected.",
    difficulty: "medium",
    unlockDay: 2,
  },
  {
    id: "market-11",
    category: "Resource Allocation & Incentives",
    question: "Supply is tight during weekend nights. Would you lower prices for riders or increase pay for drivers?",
    intuition:
      "One lever stimulates demand and the other stimulates supply, so the answer depends on which side is constrained.",
    interview_answer:
      "I would first identify whether the marketplace is supply-constrained or demand-constrained in those hours. If ETAs are high, requests are unfulfilled, and driver utilization is already high, lowering rider prices likely makes the imbalance worse. In that case I would lean toward targeted supply incentives or smarter matching. If supply is abundant and conversion is weak, price cuts may be more useful. The key is diagnosing the constrained side before choosing the lever.",
    real_world_example:
      "A Friday-night downtown market with long ETAs and high acceptance rates usually needs more supply, not cheaper rider demand.",
    or_angle:
      "This is equilibrium thinking: marketplace outcomes depend on both sides responding to incentives at the same time.",
    common_pitfall: "Treating price as a universal growth lever.",
    difficulty: "easy",
    unlockDay: 2,
  },
  {
    id: "market-12",
    category: "Experimentation & Product Thinking",
    question: "An ETA model’s MAE improved, but rider satisfaction fell. How would you explain that?",
    intuition:
      "A better average error does not guarantee a better user experience.",
    interview_answer:
      "I would check calibration, bias, and tail behavior. The model may have improved on easy trips while getting worse on the cases users care about most, such as long waits or highly uncertain pickups. I would also ask whether the new predictions changed product behavior, for example by setting overconfident expectations. In marketplace systems, the right metric is often outcome-aligned trust, not just average prediction accuracy.",
    real_world_example:
      "In food delivery, a prep-time model can reduce average error but still frustrate users if it consistently underestimates the long-delay orders that drive complaints.",
    or_angle:
      "Stochastic thinking helps because uncertainty itself is part of the product experience. Decision quality depends on distribution shape, not just mean error.",
    common_pitfall:
      "Assuming offline model metrics automatically map to business value.",
    difficulty: "medium",
    unlockDay: 2,
  },
  {
    id: "market-13",
    category: "Matching, Queues & Flows",
    question: "How would you use network flow intuition to talk about rider-driver matching?",
    intuition:
      "Think of riders and drivers as nodes with feasible edges between them, where the system wants a high-quality overall matching.",
    interview_answer:
      "I would explain that each potential rider-driver pair is a candidate edge with a cost or score based on ETA, pickup distance, fairness, or expected downstream value. The goal is not simply to match everyone greedily, but to choose a set of matches that works well for the network as a whole. This framing helps explain why batching, capacity constraints, and opportunity cost matter in dispatch systems.",
    real_world_example:
      "If one driver can feasibly serve several riders, the system should consider how assigning that driver affects all remaining choices, not just the first request that arrived.",
    or_angle:
      "Network flow thinking gives you a systems vocabulary for matching quality without diving into formal optimization theory.",
    common_pitfall:
      "Describing matching as a sequence of isolated nearest-neighbor decisions.",
    difficulty: "medium",
    unlockDay: 2,
  },
  {
    id: "market-14",
    category: "Marketplace Diagnosis",
    question: "How would you investigate an increase in driver cancellations?",
    intuition:
      "Ask whether drivers are rejecting the economics, the logistics, or the information quality of the job.",
    interview_answer:
      "I would segment by pickup distance, destination visibility, trip length, expected earnings, neighborhood, and time of day. I would also check whether ETA estimates or restaurant prep estimates became less reliable, because bad information can make jobs look attractive until drivers arrive. Then I would compare whether cancellations are concentrated in specific cohorts like airport queues, long pickups, or low-paying trips. That gives a cleaner path to intervention than treating all cancellations as one problem.",
    real_world_example:
      "In delivery, if drivers repeatedly reach restaurants before food is ready, they may start dropping orders that appear similar in the future.",
    or_angle:
      "This is optimization under uncertainty: agents respond to expected value, but also to risk and wasted time.",
    common_pitfall:
      "Averaging across all trips and missing the trip attributes that actually trigger cancellations.",
    difficulty: "medium",
    unlockDay: 3,
  },
  {
    id: "market-15",
    category: "Resource Allocation & Incentives",
    question: "How would you talk about supply-demand equilibrium in an interview without sounding too academic?",
    intuition:
      "Use plain language: the platform works best when there are enough drivers where riders want rides, at prices both sides accept.",
    interview_answer:
      "I would say marketplace balance means matching rider demand and driver supply closely enough that waits stay low, earnings stay attractive, and prices stay acceptable. When the system gets out of balance, you see symptoms like rising ETAs, lower conversion, or driver idle time. The job of pricing, incentives, and matching is to push the system back toward that healthy operating region. I would keep it grounded in operational metrics rather than equations.",
    real_world_example:
      "Uber’s marketplace materials emphasize lower wait times for riders and dependable earnings for drivers as dual goals, which is a very practical equilibrium framing.",
    or_angle:
      "OR gives you a disciplined way to think about balancing multiple objectives under real constraints.",
    common_pitfall:
      "Turning the answer into abstract economics instead of connecting it to wait times, conversion, and earnings.",
    difficulty: "easy",
    unlockDay: 3,
  },
  {
    id: "market-16",
    category: "Experimentation & Product Thinking",
    question: "What makes a candidate sound strong when answering open-ended marketplace questions?",
    intuition:
      "They sound structured, causal, and operational rather than jumping to a favorite model.",
    interview_answer:
      "A strong answer usually does four things: defines the objective, breaks the problem into system components, identifies the likely bottleneck, and proposes a measurable next step with guardrails. Strong candidates also speak in tradeoffs: rider experience versus driver earnings, short-term gains versus long-term marketplace health, and averages versus tails. They do not hide behind jargon. They make good decisions under ambiguity.",
    real_world_example:
      "When asked about wait times, a strong candidate discusses demand spikes, driver positioning, matching quality, measurement, and rollout risk rather than saying 'I would build an ML model.'",
    or_angle:
      "OR helps the candidate reason in constraints, flows, and tradeoffs, which makes the answer feel more senior and systems-oriented.",
    common_pitfall:
      "Giving a bag of techniques instead of a decision framework.",
    difficulty: "easy",
    unlockDay: 3,
  },
  {
    id: "market-17",
    category: "Experimentation & Product Thinking",
    question: "How would you design an experiment for a new dispatch policy when spillovers are likely?",
    intuition:
      "Randomize at the level where interference is manageable, not at the individual trip level by default.",
    interview_answer:
      "I would start by mapping how treatment can affect untreated units through shared supply. If spillovers are local and time-dependent, switchbacks or geo-time blocks are attractive because they reduce contamination while preserving operational realism. I would predefine primary metrics, guardrails, and segment cuts, and I would monitor whether treatment causes rebalancing into or out of neighboring zones. The design should match the way the marketplace actually couples users together.",
    real_world_example:
      "Uber’s recent marketplace balance post mentions switchback experiments, which is a strong hint that time-based randomization is practical in this kind of system.",
    or_angle:
      "This is dynamic systems thinking. The treatment changes the state of the system, not just one user’s experience.",
    common_pitfall:
      "Using the easiest randomization unit rather than the one that matches the system.",
    difficulty: "hard",
    unlockDay: 3,
  },
  {
    id: "market-18",
    category: "Marketplace Diagnosis",
    question: "Food delivery orders are taking longer, but driver supply is stable. Where would you look next?",
    intuition:
      "Delivery time is a chain, so stable courier supply does not rule out prep-time or batching problems.",
    interview_answer:
      "I would decompose the delivery journey into order placement, restaurant prep, courier dispatch, pickup wait, and last-mile travel. Then I would check whether restaurant readiness estimates drifted, batching increased, or order mix shifted toward slower merchants or items. Stable driver supply only tells me one link in the chain is unchanged. The delay could still come from restaurant operations or from dispatch logic mis-timing courier arrival.",
    real_world_example:
      "Grubhub-style systems often suffer when drivers arrive early to restaurants and wait, which feels like a courier problem to the user but is really a timing and prep prediction problem.",
    or_angle:
      "Queueing and flow decomposition help you isolate which stage is accumulating delay.",
    common_pitfall:
      "Assuming the visible agent in the last mile is always where the root cause sits.",
    difficulty: "medium",
    unlockDay: 3,
  },
  {
    id: "market-19",
    category: "Resource Allocation & Incentives",
    question: "How would you reason about targeted incentives versus blanket incentives?",
    intuition:
      "Targeted incentives are usually cheaper, but only if you can identify the true constraint well enough.",
    interview_answer:
      "I would compare the marginal value of incremental supply across areas and times. If shortages are concentrated, targeted incentives are more efficient and create less deadweight spend. But if the targeting logic is noisy, overly narrow incentives can miss the moments when the market actually needs help. I would evaluate both immediate response and whether drivers game the threshold conditions.",
    real_world_example:
      "A bonus valid only in a small downtown polygon may fail if drivers park just outside it or if the real shortage shifts as nightlife demand moves.",
    or_angle:
      "This is constrained optimization with noisy signals. Better targeting is powerful, but only when measurement quality is strong.",
    common_pitfall:
      "Assuming more granularity is automatically better.",
    difficulty: "medium",
    unlockDay: 4,
  },
  {
    id: "market-20",
    category: "Marketplace Diagnosis",
    question: "A rider conversion metric improved after a pricing test, but completed trips did not. What might explain that?",
    intuition:
      "The price change may have increased requests without increasing feasible service.",
    interview_answer:
      "I would consider whether lower prices brought in more intent but not enough fulfillable demand. If supply was fixed, the system may have attracted extra requests that later canceled, timed out, or crowded each other out. I would inspect request-to-match rate, completion rate conditional on request, ETA, and supply responsiveness. This would tell me whether the pricing test improved true marketplace throughput or just created more top-of-funnel activity.",
    real_world_example:
      "A cheaper ride offer during a supply-constrained hour can make the app look more attractive while worsening waits and cancellations.",
    or_angle:
      "Throughput matters more than just arrivals into the system. Queueing thinking keeps you honest about what the system can actually serve.",
    common_pitfall:
      "Celebrating top-of-funnel gains without checking whether the marketplace cleared the extra demand.",
    difficulty: "medium",
    unlockDay: 4,
  },
];

const state = {
  cards: [],
  progress: loadJson(STORAGE_KEY, {}),
  meta: loadJson(META_KEY, {
    reviewLog: {},
    dailyNewShown: {},
    startDate: TODAY,
  }),
  mode: "review",
  queue: [],
  currentIndex: 0,
  flipped: false,
  revealAvailableAt: 0,
  timerId: null,
};

const elements = {
  modeLabel: document.getElementById("mode-label"),
  queueCount: document.getElementById("queue-count"),
  streakCount: document.getElementById("streak-count"),
  topic: document.getElementById("card-topic"),
  question: document.getElementById("card-question"),
  position: document.getElementById("card-position"),
  flashcard: document.getElementById("flashcard"),
  front: document.getElementById("front-content"),
  back: document.getElementById("back-content"),
  flipBtn: document.getElementById("flip-btn"),
  prevBtn: document.getElementById("prev-btn"),
  nextBtn: document.getElementById("next-btn"),
  timer: document.getElementById("interview-timer"),
  ratingPanel: document.getElementById("rating-panel"),
  masteredCount: document.getElementById("mastered-count"),
  dueCount: document.getElementById("due-count"),
  newLeftCount: document.getElementById("new-left-count"),
  unlockedCount: document.getElementById("unlocked-count"),
  weakTopic: document.getElementById("weak-topic"),
  topicCanvas: document.getElementById("topic-canvas"),
  activityCanvas: document.getElementById("activity-canvas"),
  queueList: document.getElementById("queue-list"),
};

init();

async function init() {
  state.cards = await loadCards();
  if (!state.meta.startDate) {
    state.meta.startDate = TODAY;
  }
  ensureProgressDefaults();
  bindEvents();
  rebuildQueue();
  render();
}

async function loadCards() {
  try {
    const response = await fetch("cards.json");
    if (!response.ok) {
      throw new Error("cards.json unavailable");
    }
    return await response.json();
  } catch (error) {
    return DEFAULT_CARDS;
  }
}

function ensureProgressDefaults() {
  state.cards.forEach((card) => {
    if (!state.progress[card.id]) {
      state.progress[card.id] = createProgressRecord();
    }
  });
  persist();
}

function createProgressRecord() {
  return {
    interval: 0,
    easeFactor: 2.5,
    repetitions: 0,
    lapses: 0,
    lastReviewed: null,
    dueDate: null,
    lastRating: null,
  };
}

function bindEvents() {
  elements.flipBtn.addEventListener("click", flipCard);
  elements.prevBtn.addEventListener("click", () => navigate(-1));
  elements.nextBtn.addEventListener("click", () => navigate(1));
  elements.flashcard.addEventListener("click", flipCard);

  document.querySelectorAll(".rating-btn").forEach((button) => {
    button.addEventListener("click", () => rateCard(Number(button.dataset.rating)));
  });

  document.querySelectorAll(".mode-btn").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".mode-btn").forEach((item) => item.classList.remove("is-active"));
      button.classList.add("is-active");
      state.mode = button.dataset.mode;
      state.currentIndex = 0;
      state.flipped = false;
      rebuildQueue();
      render();
    });
  });

  document.addEventListener("keydown", (event) => {
    if (["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
      return;
    }

    if (event.code === "Space") {
      event.preventDefault();
      flipCard();
    }

    if (event.key === "ArrowRight") {
      navigate(1);
    }

    if (event.key === "ArrowLeft") {
      navigate(-1);
    }

    if (/^[1-4]$/.test(event.key) && !elements.ratingPanel.classList.contains("hidden")) {
      rateCard(Number(event.key));
    }
  });

  window.addEventListener("resize", renderDashboard);
}

function rebuildQueue() {
  const unlockedCards = getUnlockedCards();
  const queueCards = unlockedCards.map((card) => ({
    ...card,
    progress: state.progress[card.id],
  }));

  const newShownToday = state.meta.dailyNewShown[TODAY] || 0;
  const remainingNew = Math.max(0, DAILY_NEW_LIMIT - newShownToday);
  const due = queueCards.filter((card) => isReviewDue(card.progress)).sort(compareDueThenWeak);
  const unseen = queueCards
    .filter((card) => !card.progress.lastReviewed)
    .sort((a, b) => difficultyRank(a.difficulty) - difficultyRank(b.difficulty));
  const learning = queueCards
    .filter((card) => card.progress.lastReviewed && !isReviewDue(card.progress))
    .sort(compareDueThenWeak);
  const weak = [...queueCards]
    .filter((card) => weakness(card.progress) > 0)
    .sort((a, b) => weakness(b.progress) - weakness(a.progress));

  if (state.mode === "weak") {
    state.queue = weak.slice(0, 12);
  } else if (state.mode === "browse") {
    state.queue = [...due, ...unseen, ...learning];
  } else if (state.mode === "interview") {
    state.queue = [...due, ...weak.slice(0, 6), ...unseen.slice(0, remainingNew)];
  } else {
    state.queue = [...due, ...weak.slice(0, 4), ...unseen.slice(0, remainingNew), ...learning];
  }

  dedupeQueue();
  state.currentIndex = clamp(state.currentIndex, 0, Math.max(0, state.queue.length - 1));
  state.flipped = false;
  resetInterviewGate();
}

function getUnlockedCards() {
  const currentDay = getProgramDay();
  return state.cards.filter((card) => card.unlockDay <= currentDay);
}

function getProgramDay() {
  return daysBetween(state.meta.startDate || TODAY, TODAY) + 1;
}

function compareDueThenWeak(a, b) {
  const aDue = a.progress.dueDate || "9999-12-31";
  const bDue = b.progress.dueDate || "9999-12-31";
  if (aDue !== bDue) {
    return aDue.localeCompare(bDue);
  }
  return weakness(b.progress) - weakness(a.progress);
}

function weakness(progress) {
  if (!progress.lastReviewed) {
    return 0;
  }
  return progress.lapses * 3 + (3 - Math.min(progress.easeFactor, 3)) * 2 + (progress.lastRating === 1 ? 2 : 0);
}

function difficultyRank(value) {
  return { easy: 1, medium: 2, hard: 3 }[value] || 2;
}

function isReviewDue(progress) {
  return Boolean(progress.lastReviewed) && (!progress.dueDate || progress.dueDate <= TODAY);
}

function dedupeQueue() {
  const seen = new Set();
  state.queue = state.queue.filter((card) => {
    if (seen.has(card.id)) {
      return false;
    }
    seen.add(card.id);
    return true;
  });
}

function navigate(direction) {
  if (!state.queue.length) {
    return;
  }
  state.currentIndex =
    (state.currentIndex + direction + state.queue.length) % state.queue.length;
  state.flipped = false;
  resetInterviewGate();
  render();
}

function flipCard() {
  const card = getCurrentCard();
  if (!card) {
    return;
  }
  if (!state.flipped && state.mode === "interview" && Date.now() < state.revealAvailableAt) {
    renderTimer();
    return;
  }
  state.flipped = !state.flipped;
  renderCard();
}

function rateCard(rating) {
  const card = getCurrentCard();
  if (!card) {
    return;
  }

  const progress = state.progress[card.id];
  const wasNew = !progress.lastReviewed;
  applySm2(progress, rating);
  progress.lastReviewed = TODAY;
  progress.lastRating = rating;
  progress.dueDate = addDays(TODAY, progress.interval);

  if (rating === 1) {
    progress.lapses += 1;
  }

  if (wasNew) {
    state.meta.dailyNewShown[TODAY] = (state.meta.dailyNewShown[TODAY] || 0) + 1;
  }
  state.meta.reviewLog[TODAY] = (state.meta.reviewLog[TODAY] || 0) + 1;

  persist();
  rebuildQueue();
  render();
}

function applySm2(progress, rating) {
  if (rating === 1) {
    progress.repetitions = 0;
    progress.interval = 1;
    progress.easeFactor = Math.max(1.3, progress.easeFactor - 0.2);
    return;
  }

  if (rating === 2) {
    progress.repetitions += 1;
    progress.interval = Math.max(1, progress.interval ? Math.round(progress.interval * 1.2) : 1);
    progress.easeFactor = Math.max(1.3, progress.easeFactor - 0.08);
    return;
  }

  if (progress.repetitions === 0) {
    progress.interval = 1;
  } else if (progress.repetitions === 1) {
    progress.interval = 3;
  } else {
    const multiplier = rating === 4 ? progress.easeFactor + 0.15 : progress.easeFactor;
    progress.interval = Math.max(1, Math.round(progress.interval * multiplier));
  }

  progress.repetitions += 1;
  progress.easeFactor = Math.max(
    1.3,
    progress.easeFactor + (rating === 4 ? 0.15 : 0.03)
  );
}

function render() {
  renderMode();
  renderCard();
  renderQueue();
  renderDashboard();
}

function renderMode() {
  const labels = {
    review: "Daily Review",
    interview: "Interview Mode",
    weak: "Weak Areas",
    browse: "Browse All",
  };

  elements.modeLabel.textContent = labels[state.mode];
  elements.queueCount.textContent = `${state.queue.length} ${state.queue.length === 1 ? "card" : "cards"}`;
  const streak = calculateStreak();
  elements.streakCount.textContent = `${streak} ${streak === 1 ? "day" : "days"}`;
}

function renderCard() {
  const card = getCurrentCard();
  clearTimerInterval();
  elements.flashcard.classList.toggle("is-flipped", state.flipped);

  if (!card) {
    elements.topic.textContent = "No cards";
    elements.question.textContent = "You are caught up for now";
    elements.position.textContent = "0 / 0";
    elements.front.innerHTML =
      "<p>Your review queue is empty. Switch to Browse All or come back tomorrow for new unlocked cards.</p>";
    elements.back.innerHTML =
      "<div class=\"answer-block\"><strong>Tip</strong><p>Your progress is stored in localStorage, so the app stays lightweight and works offline after loading.</p></div>";
    elements.ratingPanel.classList.add("hidden");
    elements.timer.classList.add("hidden");
    elements.flipBtn.textContent = "Reveal Answer";
    return;
  }

  elements.topic.textContent = `${card.category} · ${card.difficulty}`;
  elements.question.textContent = card.question;
  elements.position.textContent = `${state.currentIndex + 1} / ${state.queue.length}`;
  elements.front.innerHTML = renderFront(card);
  elements.back.innerHTML = renderBack(card);
  elements.ratingPanel.classList.toggle("hidden", !state.flipped);
  elements.flipBtn.textContent = state.flipped ? "Hide Answer" : "Reveal Answer";
  renderTimer();
}

function renderFront(card) {
  const unlockText = `Unlock Day ${card.unlockDay}`;
  const interviewPrompt =
    state.mode === "interview"
      ? "<p>Answer out loud in 30-45 seconds before revealing. Aim to diagnose the system, name the tradeoffs, and propose a measurement plan.</p>"
      : "<p>Think like a strong mid-level DS or MLE: what would you check first, and what would you say clearly in the room?</p>";

  return `
    <div class="answer-block">
      <strong>Prompt</strong>
      <p>${card.question}</p>
    </div>
    <div class="answer-block">
      <strong>Quick framing</strong>
      <p>${card.intuition}</p>
    </div>
    <div class="answer-block">
      <strong>Practice note</strong>
      <p>${interviewPrompt}</p>
      <p>${unlockText}</p>
    </div>
  `;
}

function renderBack(card) {
  return `
    <div class="answer-block">
      <strong>30-45 second answer</strong>
      <p>${card.interview_answer}</p>
    </div>
    <div class="answer-block">
      <strong>Real-world example</strong>
      <p>${card.real_world_example}</p>
    </div>
    <div class="answer-block">
      <strong>OR angle</strong>
      <p>${card.or_angle}</p>
    </div>
    <div class="answer-block">
      <strong>Common pitfall</strong>
      <p>${card.common_pitfall}</p>
    </div>
  `;
}

function renderTimer() {
  if (state.mode !== "interview" || state.flipped || !getCurrentCard()) {
    elements.timer.classList.add("hidden");
    return;
  }

  const remaining = Math.max(0, state.revealAvailableAt - Date.now());
  if (remaining <= 0) {
    elements.timer.classList.remove("hidden");
    elements.timer.textContent = "Answer window complete. Reveal when ready.";
    return;
  }

  elements.timer.classList.remove("hidden");
  elements.timer.textContent = `Interview Mode: hold your answer for ${Math.ceil(
    remaining / 1000
  )} more seconds before revealing.`;
  state.timerId = window.setInterval(() => {
    clearTimerInterval();
    renderTimer();
  }, 1000);
}

function resetInterviewGate() {
  clearTimerInterval();
  state.revealAvailableAt =
    state.mode === "interview" && getCurrentCard()
      ? Date.now() + INTERVIEW_REVEAL_DELAY_MS
      : 0;
}

function clearTimerInterval() {
  if (state.timerId) {
    window.clearInterval(state.timerId);
    state.timerId = null;
  }
}

function renderQueue() {
  const current = getCurrentCard();
  if (!state.queue.length) {
    elements.queueList.innerHTML =
      '<div class="queue-item"><strong class="queue-title">No cards in queue</strong><div class="queue-meta">Come back later or switch modes.</div></div>';
    return;
  }

  elements.queueList.innerHTML = state.queue
    .slice(0, 12)
    .map((card, index) => {
      const progress = state.progress[card.id];
      const status = !progress.lastReviewed
        ? "New"
        : isReviewDue(progress)
          ? "Due"
          : `Next ${progress.dueDate}`;
      return `
        <button class="queue-item ${current && current.id === card.id ? "is-current" : ""}" data-index="${index}">
          <strong class="queue-title">${card.question}</strong>
          <div class="queue-meta">${card.category} · ${status}</div>
        </button>
      `;
    })
    .join("");

  elements.queueList.querySelectorAll("[data-index]").forEach((button) => {
    button.addEventListener("click", () => {
      state.currentIndex = Number(button.dataset.index);
      state.flipped = false;
      resetInterviewGate();
      render();
    });
  });
}

function renderDashboard() {
  const unlocked = getUnlockedCards();
  const mastered = unlocked.filter((card) => isMastered(state.progress[card.id])).length;
  const due = unlocked.filter((card) => isReviewDue(state.progress[card.id])).length;
  const newLeft = Math.max(0, DAILY_NEW_LIMIT - (state.meta.dailyNewShown[TODAY] || 0));
  const categoryStats = buildCategoryStats(unlocked);
  const weakest = [...categoryStats].sort((a, b) => a.score - b.score)[0];

  elements.masteredCount.textContent = String(mastered);
  elements.dueCount.textContent = String(due);
  elements.newLeftCount.textContent = String(newLeft);
  elements.unlockedCount.textContent = `${unlocked.length}/${state.cards.length}`;
  elements.weakTopic.textContent = weakest ? weakest.name : "-";

  drawBarChart(elements.topicCanvas, categoryStats);
  drawActivityChart(elements.activityCanvas, state.meta.reviewLog);
}

function buildCategoryStats(cards) {
  const groups = new Map();
  cards.forEach((card) => {
    if (!groups.has(card.category)) {
      groups.set(card.category, []);
    }
    groups.get(card.category).push(state.progress[card.id]);
  });

  return [...groups.entries()].map(([name, items]) => {
    const score =
      items.reduce((sum, progress) => {
        const intervalScore = Math.min(progress.interval / 14, 1);
        const easeScore = Math.min((progress.easeFactor - 1.3) / 1.6, 1);
        const lapsePenalty = Math.min(progress.lapses * 0.12, 0.5);
        return sum + Math.max(0.05, 0.55 * intervalScore + 0.45 * easeScore - lapsePenalty);
      }, 0) / items.length;
    return { name, score };
  });
}

function drawBarChart(canvas, data) {
  const ctx = canvas.getContext("2d");
  clearCanvas(canvas);
  const width = canvas.width;
  const height = canvas.height;
  const margin = { top: 20, right: 16, bottom: 44, left: 16 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const step = innerWidth / Math.max(data.length, 1);
  const barWidth = Math.max(42, step - 12);

  data.forEach((item, index) => {
    const x = margin.left + index * step + (step - barWidth) / 2;
    const barHeight = innerHeight * item.score;
    const y = margin.top + innerHeight - barHeight;
    const gradient = ctx.createLinearGradient(x, y, x, y + barHeight);
    gradient.addColorStop(0, "rgba(95, 225, 195, 0.95)");
    gradient.addColorStop(1, "rgba(118, 168, 255, 0.85)");
    roundRect(ctx, x, y, barWidth, Math.max(8, barHeight), 10, gradient);
    ctx.fillStyle = "#9aaccc";
    ctx.font = "12px sans-serif";
    wrapText(ctx, item.name.replace(" & ", " / "), x, height - 26, barWidth, 14);
  });
}

function drawActivityChart(canvas, reviewLog) {
  const ctx = canvas.getContext("2d");
  clearCanvas(canvas);
  const width = canvas.width;
  const height = canvas.height;
  const margin = { top: 18, right: 18, bottom: 28, left: 18 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const dates = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    dates.push(addDays(TODAY, -offset));
  }
  const values = dates.map((date) => reviewLog[date] || 0);
  const maxValue = Math.max(1, ...values);

  ctx.strokeStyle = "rgba(154, 172, 204, 0.18)";
  ctx.beginPath();
  ctx.moveTo(margin.left, margin.top + innerHeight);
  ctx.lineTo(width - margin.right, margin.top + innerHeight);
  ctx.stroke();

  ctx.strokeStyle = "rgba(118, 168, 255, 0.95)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  values.forEach((value, index) => {
    const x = margin.left + (innerWidth / Math.max(values.length - 1, 1)) * index;
    const y = margin.top + innerHeight - (value / maxValue) * (innerHeight - 8);
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();

  ctx.fillStyle = "rgba(95, 225, 195, 0.95)";
  values.forEach((value, index) => {
    const x = margin.left + (innerWidth / Math.max(values.length - 1, 1)) * index;
    const y = margin.top + innerHeight - (value / maxValue) * (innerHeight - 8);
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = "#9aaccc";
  ctx.font = "12px sans-serif";
  dates.forEach((date, index) => {
    const x = margin.left + (innerWidth / Math.max(values.length - 1, 1)) * index;
    ctx.fillText(date.slice(5), x - 16, height - 10);
  });
}

function roundRect(ctx, x, y, width, height, radius, fillStyle) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.fillStyle = fillStyle;
  ctx.fill();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  let offset = 0;
  words.forEach((word) => {
    const next = `${line}${word} `;
    if (ctx.measureText(next).width > maxWidth && line) {
      ctx.fillText(line.trim(), x, y + offset);
      line = `${word} `;
      offset += lineHeight;
    } else {
      line = next;
    }
  });
  if (line) {
    ctx.fillText(line.trim(), x, y + offset);
  }
}

function clearCanvas(canvas) {
  canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
}

function isMastered(progress) {
  return progress.repetitions >= 4 && progress.interval >= 14;
}

function getCurrentCard() {
  return state.queue[state.currentIndex] || null;
}

function calculateStreak() {
  let streak = 0;
  let cursor = TODAY;
  while ((state.meta.reviewLog[cursor] || 0) > 0) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
  localStorage.setItem(META_KEY, JSON.stringify(state.meta));
}

function loadJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch (error) {
    return fallback;
  }
}

function getTodayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function daysBetween(startDate, endDate) {
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  return Math.round((end - start) / 86400000);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
