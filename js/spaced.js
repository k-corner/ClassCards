// js/spaced.js – Implementierung des SM-2 Algorithmus
// (vereinfachte Version des SuperMemo-2 Algorithmus)

class SpacedRepetition {

  // Bewertung verarbeiten und nächsten Wiederholungstermin berechnen
  // rating: 'easy', 'medium', 'hard'
  // cardProgress: { interval, easeFactor, repetitions }
  processRating(rating, cardProgress = {}) {
    let {
      interval = 1,
      easeFactor = 2.5,
      repetitions = 0
    } = cardProgress;

    // Qualität der Antwort (0-5) aus Rating ableiten
    const quality = {
      'easy': 5,
      'medium': 3,
      'hard': 1
    }[rating];

    if (quality >= 3) {
      // Karte wurde gewusst
      if (repetitions === 0) {
        interval = 1;
      } else if (repetitions === 1) {
        interval = 6;
      } else {
        interval = Math.round(interval * easeFactor);
      }
      repetitions++;
    } else {
      // Karte wurde nicht gewusst → zurücksetzen
      repetitions = 0;
      interval = 1;
    }

    // Ease Factor anpassen (zwischen 1.3 und 2.5 halten)
    easeFactor = Math.max(
      1.3,
      easeFactor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)
    );

    // Nächstes Wiederholungsdatum berechnen
    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + interval);
    nextReview.setHours(0, 0, 0, 0); // Mitternacht

    return {
      interval,
      easeFactor,
      repetitions,
      nextReview: nextReview.getTime(),
      lastReview: Date.now(),
      lastRating: rating
    };
  }

  // Karten filtern, die heute fällig sind
  getDueCards(cards, progressMap) {
    const now = Date.now();
    return cards.filter(card => {
      const progress = progressMap.get(card.id);
      if (!progress) return true; // Neue Karte → immer fällig
      return progress.nextReview <= now;
    });
  }

  // Karten nach Priorität sortieren (überfälligste zuerst)
  sortByPriority(cards, progressMap) {
    const now = Date.now();
    return cards.sort((a, b) => {
      const progressA = progressMap.get(a.id);
      const progressB = progressMap.get(b.id);
      const dueA = progressA?.nextReview || 0;
      const dueB = progressB?.nextReview || 0;
      return dueA - dueB; // Älteste zuerst
    });
  }

  // Nächstes Fälligkeitsdatum als lesbaren Text
  getNextReviewText(cardProgress) {
    if (!cardProgress?.nextReview) return 'Heute';
    const next = new Date(cardProgress.nextReview);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.round((next - today) / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) return 'Heute fällig';
    if (diffDays === 1) return 'Morgen';
    if (diffDays < 7) return `In ${diffDays} Tagen`;
    if (diffDays < 30) return `In ${Math.round(diffDays/7)} Wochen`;
    return `In ${Math.round(diffDays/30)} Monaten`;
  }
}

const spacedRep = new SpacedRepetition();
