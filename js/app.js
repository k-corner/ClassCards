// js/app.js – App-Steuerung und Event-Handler

class App {
  constructor() {
    this.currentCards = [];
    this.progressMap = new Map();
    this.dueCards = [];
    this.currentCardIndex = 0;
    this.pendingImages = [];
    this.drawingCtx = null;
    this._lightboxOpen = null; // wird in init() gesetzt
  }

  async init() {
    await db.open();
    await this.checkPrivacyConsent();
    await this.loadData();
    this.setupNavigation();
    this.setupLightbox();     // WICHTIG: vor setupLearnPage!
    this.setupLearnPage();
    this.setupAddPage();
    this.setupSyncPage();
    this.updateStats();
    console.log('ClassCards gestartet ✅');
  }

  // Datenschutz-Einwilligung prüfen
  async checkPrivacyConsent() {
    const accepted = await db.getSetting('privacyAccepted');
    if (!accepted) {
      document.getElementById('privacy-dialog').classList.remove('hidden');
      document.getElementById('accept-privacy').addEventListener('click', async () => {
        await db.setSetting('privacyAccepted', true);
        document.getElementById('privacy-dialog').classList.add('hidden');
      });
    }
  }

  // Daten laden
  async loadData() {
    this.currentCards = await db.getAllCards();
    const progressList = await db.getAllProgress();
    this.progressMap = new Map(progressList.map(p => [p.cardId, p]));
    this.dueCards = spacedRep.getDueCards(this.currentCards, this.progressMap);
    this.dueCards = spacedRep.sortByPriority(this.dueCards, this.progressMap);
    this.currentCardIndex = 0;
  }

  // Navigation zwischen Seiten
  setupNavigation() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const pageId = btn.dataset.page;
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
        btn.classList.add('active');
        document.getElementById(`page-${pageId}`).classList.remove('hidden');

        if (pageId === 'learn') this.updateLearnPage();
        if (pageId === 'browse') this.updateBrowsePage();
        if (pageId === 'stats') this.updateStats();
        if (pageId === 'sync') this.updateSyncPage();
      });
    });
  }

  // ===== LIGHTBOX =====
  setupLightbox() {
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    const closeBtn = document.getElementById('lightbox-close');
    const backdrop = lightbox.querySelector('.lightbox-backdrop');

    const closeLightbox = () => lightbox.classList.add('hidden');
    closeBtn.addEventListener('click', closeLightbox);
    backdrop.addEventListener('click', closeLightbox);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeLightbox();
    });

    // Als Methode auf this speichern – jetzt garantiert vor allen anderen Aufrufen
    this._lightboxOpen = (src) => {
      lightboxImg.src = src;
      lightbox.classList.remove('hidden');
    };
  }

  // Hilfsfunktion: Bilder rendern (mit Zoom-Funktion)
  renderImages(container, images) {
    container.innerHTML = '';
    (images || []).forEach(src => {
      const img = document.createElement('img');
      img.src = src;
      img.className = 'card-image zoomable';
      img.title = 'Tippen zum Vergrößern';
      img.addEventListener('click', () => this._lightboxOpen(src));
      container.appendChild(img);
    });
  }

  // Lernseite einrichten
  setupLearnPage() {
    document.getElementById('show-answer-btn').addEventListener('click', () => {
      document.querySelector('.flashcard-back').classList.remove('hidden');
      document.getElementById('show-answer-btn').classList.add('hidden');
      document.getElementById('rating-buttons').classList.remove('hidden');
    });

    document.querySelectorAll('.btn-rating').forEach(btn => {
      btn.addEventListener('click', async () => {
        const rating = btn.dataset.rating;
        const card = this.dueCards[this.currentCardIndex];
        const currentProgress = this.progressMap.get(card.id);
        const newProgress = spacedRep.processRating(rating, currentProgress);
        await db.saveProgress(card.id, { cardId: card.id, ...newProgress });
        this.progressMap.set(card.id, newProgress);
        this.currentCardIndex++;
        this.updateLearnPage();
      });
    });
  }

  // Lernseite aktualisieren
  updateLearnPage() {
    const badge = document.getElementById('cards-due-badge');
    const remaining = this.dueCards.length - this.currentCardIndex;
    badge.textContent = `${remaining} fällig`;

    if (this.currentCardIndex >= this.dueCards.length) {
      document.getElementById('flashcard-container').classList.add('hidden');
      document.getElementById('no-cards-due').classList.remove('hidden');
      return;
    }

    document.getElementById('flashcard-container').classList.remove('hidden');
    document.getElementById('no-cards-due').classList.add('hidden');

    const card = this.dueCards[this.currentCardIndex];
    document.getElementById('card-category').textContent = card.category;
    document.getElementById('card-question').innerHTML =
      cardManager.renderFormulas(card.question);
    document.getElementById('card-answer').innerHTML =
      cardManager.renderFormulas(card.answer || '');

    // Vorderseite: NUR Bilder die als "Frage-Bilder" markiert sind
    // (für ältere Karten ohne frontImages: leer lassen)
    const imgFront = document.getElementById('card-images-front');
    this.renderImages(imgFront, card.frontImages || []);

    // Rückseite: Antwort-Bilder (images = Antwort-Bilder)
    const imgBack = document.getElementById('card-images-back');
    this.renderImages(imgBack, card.images || []);

    // Rückseite verstecken
    document.querySelector('.flashcard-back').classList.add('hidden');
    document.getElementById('show-answer-btn').classList.remove('hidden');
    document.getElementById('rating-buttons').classList.add('hidden');
  }

  // Karte hinzufügen einrichten
  setupAddPage() {
    // Bild-Upload
    document.getElementById('upload-image-btn').addEventListener('click', () => {
      document.getElementById('image-input').click();
    });

    document.getElementById('image-input').addEventListener('change', async (e) => {
      for (const file of e.target.files) {
        const base64 = await cardManager.imageToBase64(file);
        const compressed = await cardManager.compressImage(base64);
        this.pendingImages.push(compressed);
        this.updateImagePreview();
      }
      // Antwort-Pflichtfeld dynamisch anpassen
      this.updateAnswerRequired();
    });

    // Zeichnen
    document.getElementById('draw-btn').addEventListener('click', () => {
      document.getElementById('drawing-area').classList.toggle('hidden');
      const canvas = document.getElementById('draw-canvas');
      if (!this.drawingCtx) {
        this.drawingCtx = cardManager.setupCanvas(canvas);
      }
    });

    document.getElementById('clear-canvas').addEventListener('click', () => {
      const canvas = document.getElementById('draw-canvas');
      this.drawingCtx.clearRect(0, 0, canvas.width, canvas.height);
    });

    document.getElementById('save-drawing').addEventListener('click', () => {
      const canvas = document.getElementById('draw-canvas');
      const base64 = cardManager.canvasToBase64(canvas);
      this.pendingImages.push(base64);
      this.updateImagePreview();
      document.getElementById('drawing-area').classList.add('hidden');
      this.drawingCtx.clearRect(0, 0, canvas.width, canvas.height);
      // Antwort-Pflichtfeld dynamisch anpassen
      this.updateAnswerRequired();
    });

    // Formular absenden
    document.getElementById('add-card-form').addEventListener('submit', async (e) => {
      e.preventDefault();

      const answerText = document.getElementById('card-answer-input').value.trim();
      const hasImages = this.pendingImages.length > 0;

      // Validierung: Entweder Text-Antwort ODER Bild muss vorhanden sein
      if (!answerText && !hasImages) {
        alert('Bitte gib eine Textantwort ein oder füge ein Bild hinzu.');
        return;
      }

      const card = await cardManager.saveCard({
        question: document.getElementById('card-question-input').value,
        answer: answerText,
        category: document.getElementById('card-category-input').value,
        images: [...this.pendingImages],  // Antwort-Bilder
        frontImages: [],                   // Vorderseiten-Bilder (für zukünftige Erweiterung)
        createdBy: await db.getSetting('userName') || 'Anonym'
      });

      this.currentCards.push(card);
      this.pendingImages = [];
      this.updateImagePreview();
      this.updateAnswerRequired();
      e.target.reset();
      alert(`✅ Karte gespeichert! (Gesamt: ${this.currentCards.length})`);
    });
  }

  // Antwort-Pflichtfeld dynamisch setzen
  updateAnswerRequired() {
    const answerInput = document.getElementById('card-answer-input');
    const hasImages = this.pendingImages.length > 0;
    answerInput.required = !hasImages;

    // Visuelles Feedback
    const label = answerInput.previousElementSibling;
    if (label && label.tagName === 'LABEL') {
      label.textContent = hasImages
        ? 'Antwort (optional – Bild vorhanden)'
        : 'Antwort *';
    }

    // Placeholder anpassen
    answerInput.placeholder = hasImages
      ? 'Optional: Zusätzliche Textantwort...'
      : 'Die vollständige Antwort... (Pflichtfeld, wenn kein Bild)';
  }

  updateImagePreview() {
    const preview = document.getElementById('image-preview');
    preview.innerHTML = '';
    this.pendingImages.forEach((src, index) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'image-preview-item';
      const img = document.createElement('img');
      img.src = src;
      const removeBtn = document.createElement('button');
      removeBtn.textContent = '✕';
      removeBtn.type = 'button';
      removeBtn.onclick = () => {
        this.pendingImages.splice(index, 1);
        this.updateImagePreview();
        this.updateAnswerRequired();
      };
      wrapper.appendChild(img);
      wrapper.appendChild(removeBtn);
      preview.appendChild(wrapper);
    });
  }

  // Sync-Seite einrichten
  setupSyncPage() {
    document.getElementById('import-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const status = document.getElementById('import-status');
      status.classList.remove('hidden');
      try {
        const result = await syncManager.importDatabase(file);
        status.className = 'status-message success';
        status.textContent =
          `✅ Import erfolgreich! ${result.new} neue Karten, ${result.updated} aktualisiert.`;
        await this.loadData();
        this.updateSyncPage();
      } catch (err) {
        status.className = 'status-message error';
        status.textContent = '❌ Fehler: ' + err.message;
      }
    });

    document.getElementById('export-btn').addEventListener('click', async () => {
      const count = await syncManager.exportDatabase();
      alert(`✅ ${count} Karten exportiert (inkl. aller Bilder)!\nBitte Datei auf ByCS Drive hochladen.`);
    });

    document.getElementById('export-progress-btn').addEventListener('click', async () => {
      await syncManager.exportProgress();
    });

    document.getElementById('import-progress-file').addEventListener('change',
      async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const count = await syncManager.importProgress(file);
          alert(`✅ ${count} Fortschrittseinträge importiert!`);
          await this.loadData();
        } catch (err) {
          alert('❌ Fehler: ' + err.message);
        }
      }
    );
  }

  updateSyncPage() {
    document.getElementById('total-cards-count').textContent =
      this.currentCards.length;
  }

  // ===== ALLE KARTEN – Aufklappbar + "Heute fällig" Button + Swipe =====
  updateBrowsePage() {
    const list = document.getElementById('cards-list');
    const searchInput = document.getElementById('search-input');
    const searchTerm = searchInput?.value?.toLowerCase() || '';

    list.innerHTML = '';

    const filtered = this.currentCards.filter(card =>
      card.question.toLowerCase().includes(searchTerm) ||
      (card.answer || '').toLowerCase().includes(searchTerm) ||
      card.category.toLowerCase().includes(searchTerm)
    );

    if (filtered.length === 0) {
      list.innerHTML =
        '<p style="color:var(--mid);text-align:center;padding:20px;">Keine Karten gefunden.</p>';
      return;
    }

    filtered.forEach(card => {
      const progress = this.progressMap.get(card.id);
      const isDueToday = !progress || progress.nextReview <= Date.now();

      const item = document.createElement('div');
      item.className = 'card-list-item';

      // Swipe-Unterstützung für "Heute fällig"
      let touchStartX = 0;
      let touchStartY = 0;

      item.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      }, { passive: true });

      item.addEventListener('touchend', (e) => {
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = Math.abs(e.changedTouches[0].clientY - touchStartY);
        // Swipe nach rechts (mind. 80px, nicht zu viel vertikal)
        if (dx > 80 && dy < 40) {
          this.markCardDueToday(card.id, item);
        }
      }, { passive: true });

      // Bilder-HTML vorbereiten (nur Antwort-Bilder in der Übersicht)
      const hasImages = card.images && card.images.length > 0;
      const imagesHTML = hasImages
        ? card.images.map(src =>
            `<img src="${src}" class="card-list-image zoomable" alt="Kartenbild">`
          ).join('')
        : '';

      // Antwort-Text (kann leer sein wenn nur Bild)
      const answerHTML = card.answer
        ? `<div class="card-list-answer">
             <strong>Antwort:</strong><br>
             ${cardManager.renderFormulas(card.answer)}
           </div>`
        : '';

      item.innerHTML = `
        <div class="card-list-header" data-expanded="false">
          <div class="card-list-header-text">
            <div class="card-list-category">${card.category}</div>
            <div class="card-list-question">
              ${cardManager.renderFormulas(card.question)}
            </div>
          </div>
          <div class="card-list-header-actions">
            ${!isDueToday
              ? `<button class="btn-due-today" title="Heute wiederholen" data-id="${card.id}">
                   📅
                 </button>`
              : `<span class="badge-due">fällig</span>`
            }
            <span class="card-list-toggle">▼</span>
          </div>
        </div>
        <div class="card-list-detail hidden">
          ${answerHTML}
          ${hasImages ? `<div class="card-list-images">${imagesHTML}</div>` : ''}
          <div class="card-list-meta">
            ${spacedRep.getNextReviewText(progress)}
            ${card.createdBy ? ` · Erstellt von: ${card.createdBy}` : ''}
          </div>
          <div class="card-list-swipe-hint">
            💡 Tipp: Nach rechts wischen → heute fällig setzen
          </div>
        </div>
      `;

      // Aufklappen / Zuklappen (nur wenn NICHT auf Button geklickt)
      const header = item.querySelector('.card-list-header');
      const detail = item.querySelector('.card-list-detail');
      const toggle = item.querySelector('.card-list-toggle');

      header.addEventListener('click', (e) => {
        // Klick auf Button nicht weiterleiten
        if (e.target.closest('.btn-due-today')) return;

        const isExpanded = header.dataset.expanded === 'true';
        detail.classList.toggle('hidden', isExpanded);
        toggle.textContent = isExpanded ? '▼' : '▲';
        header.dataset.expanded = String(!isExpanded);
      });

      // "Heute fällig"-Button
      const dueBtn = item.querySelector('.btn-due-today');
      if (dueBtn) {
        dueBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.markCardDueToday(card.id, item);
        });
      }

      // Zoom für Bilder
      item.querySelectorAll('.card-list-image.zoomable').forEach(img => {
        img.addEventListener('click', (e) => {
          e.stopPropagation();
          this._lightboxOpen(img.src);
        });
      });

      list.appendChild(item);
    });

    // Suche live (nur einmal registrieren)
    if (!searchInput._listenerAdded) {
      searchInput.addEventListener('input', () => this.updateBrowsePage());
      searchInput._listenerAdded = true;
    }
  }

  // Karte sofort als "heute fällig" markieren
  async markCardDueToday(cardId, itemElement) {
    const progress = this.progressMap.get(cardId) || {};
    const updated = {
      ...progress,
      cardId,
      nextReview: Date.now() - 1000 // Eine Sekunde in der Vergangenheit = fällig
    };
    await db.saveProgress(cardId, updated);
    this.progressMap.set(cardId, updated);

    // Visuelles Feedback
    itemElement.classList.add('card-marked-due');
    const actionsDiv = itemElement.querySelector('.card-list-header-actions');
    if (actionsDiv) {
      const btn = actionsDiv.querySelector('.btn-due-today');
      if (btn) btn.replaceWith(Object.assign(
        document.createElement('span'), {
          className: 'badge-due',
          textContent: 'fällig ✅'
        }
      ));
    }

    // Lernseite-Badge aktualisieren
    await this.loadData();
    const badge = document.getElementById('cards-due-badge');
    badge.textContent = `${this.dueCards.length} fällig`;
  }

  updateStats() {
    const due = spacedRep.getDueCards(this.currentCards, this.progressMap);
    const learned = Array.from(this.progressMap.values())
      .filter(p => p.repetitions > 0).length;

    document.getElementById('stat-total').textContent = this.currentCards.length;
    document.getElementById('stat-due').textContent = due.length;
    document.getElementById('stat-learned').textContent = learned;
  }
}

// App starten
const app = new App();
app.init().catch(console.error);
