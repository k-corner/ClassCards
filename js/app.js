// js/app.js – App-Steuerung und Event-Handler

class App {
  constructor() {
    this.currentCards = [];
    this.progressMap = new Map();
    this.dueCards = [];
    this.currentCardIndex = 0;
    this.pendingImages = [];
    this.drawingCtx = null;
  }

  async init() {
    await db.open();
    await this.checkPrivacyConsent();
    await this.loadData();
    this.setupNavigation();
    this.setupLearnPage();
    this.setupAddPage();
    this.setupSyncPage();
    this.updateStats();
    console.log('LernkartenApp gestartet ✅');
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

        // Seite aktualisieren
        if (pageId === 'learn') this.updateLearnPage();
        if (pageId === 'browse') this.updateBrowsePage();
        if (pageId === 'stats') this.updateStats();
        if (pageId === 'sync') this.updateSyncPage();
      });
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
      cardManager.renderFormulas(card.answer);

    // Bilder anzeigen
    const imgContainer = document.getElementById('card-images-front');
    imgContainer.innerHTML = '';
    (card.images || []).forEach(src => {
      const img = document.createElement('img');
      img.src = src;
      img.className = 'card-image';
      imgContainer.appendChild(img);
    });

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
    });

    // Zeichenbereich
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
    });

    // Formular absenden
    document.getElementById('add-card-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const card = await cardManager.saveCard({
        question: document.getElementById('card-question-input').value,
        answer: document.getElementById('card-answer-input').value,
        category: document.getElementById('card-category-input').value,
        images: [...this.pendingImages],
        createdBy: await db.getSetting('userName') || 'Anonym'
      });
      this.currentCards.push(card);
      this.pendingImages = [];
      this.updateImagePreview();
      e.target.reset();
      alert(`✅ Karte gespeichert! (Gesamt: ${this.currentCards.length})`);
    });
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
      removeBtn.onclick = () => {
        this.pendingImages.splice(index, 1);
        this.updateImagePreview();
      };
      wrapper.appendChild(img);
      wrapper.appendChild(removeBtn);
      preview.appendChild(wrapper);
    });
  }

  // Sync-Seite einrichten
  setupSyncPage() {
    // Import
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

    // Export
    document.getElementById('export-btn').addEventListener('click', async () => {
      const count = await syncManager.exportDatabase();
      alert(`✅ ${count} Karten exportiert! Bitte Datei auf ByCS Drive hochladen.`);
    });

    // Fortschritt exportieren
    document.getElementById('export-progress-btn').addEventListener('click', async () => {
      await syncManager.exportProgress();
    });

    // Fortschritt importieren
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

  updateBrowsePage() {
    const list = document.getElementById('cards-list');
    list.innerHTML = '';
    this.currentCards.forEach(card => {
      const item = document.createElement('div');
      item.className = 'card-list-item';
      const progress = this.progressMap.get(card.id);
      item.innerHTML = `
        <div class="card-list-category">${card.category}</div>
        <div class="card-list-question">
          ${cardManager.renderFormulas(card.question)}
        </div>
        <div class="card-list-meta">
          ${spacedRep.getNextReviewText(progress)}
        </div>
      `;
      list.appendChild(item);
    });
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
