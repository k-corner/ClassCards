// js/app.js – App-Steuerung und Event-Handler

class App {
  constructor() {
    this.currentCards = [];
    this.progressMap = new Map();
    this.dueCards = [];
    this.currentCardIndex = 0;
    this.pendingImages = [];
    this.drawingCtx = null;
    this._lightboxOpen = null;
    this.selectedCardIds = new Set();
    this.activeFilter = null; // aktiver Kapitel-Filter
  }

  async init() {
    await db.open();
    await this.checkPrivacyConsent();
    await this.loadData();
    this.setupNavigation();
    this.setupLightbox();
    this.setupLearnPage();
    this.setupAddPage();
    this.setupSyncPage();
    this.updateStats();
    console.log('ClassCards gestartet ✅');
  }

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

  async loadData() {
    this.currentCards = await db.getAllCards();
    const progressList = await db.getAllProgress();
    this.progressMap = new Map(progressList.map(p => [p.cardId, p]));
    this.dueCards = spacedRep.getDueCards(this.currentCards, this.progressMap);
    // Zufällige Reihenfolge statt nach Erstellung
    this.dueCards = this.shuffleArray(this.dueCards);
    this.currentCardIndex = 0;
  }

  // Fisher-Yates Shuffle
  shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

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

    this._lightboxOpen = (src) => {
      lightboxImg.src = src;
      lightbox.classList.remove('hidden');
    };
  }

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

  // ===== LERNSEITE =====
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

    const imgFront = document.getElementById('card-images-front');
    this.renderImages(imgFront, card.frontImages || []);

    const imgBack = document.getElementById('card-images-back');
    this.renderImages(imgBack, card.images || []);

    document.querySelector('.flashcard-back').classList.add('hidden');
    document.getElementById('show-answer-btn').classList.remove('hidden');
    document.getElementById('rating-buttons').classList.add('hidden');
  }

  // ===== KARTE HINZUFÜGEN =====
  setupAddPage() {
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
      this.updateAnswerRequired();
    });

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
      this.updateAnswerRequired();
    });

    const categoryInput = document.getElementById('card-category-input');
    const datalist = document.getElementById('category-suggestions');
    categoryInput.addEventListener('focus', () => {
      this.updateCategorySuggestions(datalist);
    });

    document.getElementById('add-card-form').addEventListener('submit', async (e) => {
      e.preventDefault();

      const answerText = document.getElementById('card-answer-input').value.trim();
      const hasImages = this.pendingImages.length > 0;

      if (!answerText && !hasImages) {
        alert('Bitte gib eine Textantwort ein oder füge ein Bild hinzu.');
        return;
      }

      const card = await cardManager.saveCard({
        question: document.getElementById('card-question-input').value,
        answer: answerText,
        category: categoryInput.value,
        images: [...this.pendingImages],
        frontImages: [],
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

  updateCategorySuggestions(datalist) {
    const categories = [...new Set(this.currentCards.map(c => c.category))].sort();
    datalist.innerHTML = '';
    categories.forEach(cat => {
      const option = document.createElement('option');
      option.value = cat;
      datalist.appendChild(option);
    });
  }

  updateAnswerRequired() {
    const answerInput = document.getElementById('card-answer-input');
    const hasImages = this.pendingImages.length > 0;
    answerInput.required = !hasImages;

    const label = answerInput.previousElementSibling;
    if (label && label.tagName === 'LABEL') {
      label.textContent = hasImages
        ? 'Antwort (optional – Bild vorhanden)'
        : 'Antwort *';
    }

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

  // ===== SYNC =====
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

    document.getElementById('import-progress-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const count = await syncManager.importProgress(file);
        alert(`✅ ${count} Fortschrittseinträge importiert!`);
        await this.loadData();
      } catch (err) {
        alert('❌ Fehler: ' + err.message);
      }
    });

    // Datenbank löschen
    document.getElementById('delete-db-btn').addEventListener('click', async () => {
      if (!confirm('⚠️ Alle Karteikarten wirklich löschen?\nDiese Aktion kann nicht rückgängig gemacht werden!')) return;
      const confirmText = prompt('Zur Bestätigung bitte "LÖSCHEN" eintippen:');
      if (confirmText !== 'LÖSCHEN') { alert('Abgebrochen.'); return; }
      const cards = await db.getAllCards();
      for (const card of cards) await db.deleteCard(card.id);
      await this.loadData();
      this.updateSyncPage();
      alert('✅ Alle Karteikarten wurden gelöscht.');
    });

    // Lernfortschritt zurücksetzen
    document.getElementById('reset-progress-btn').addEventListener('click', async () => {
      if (!confirm('⚠️ Deinen gesamten Lernfortschritt wirklich zurücksetzen?\nAlle Karten werden wieder als "neu" markiert.')) return;
      await db.clearProgress();
      await this.loadData();
      this.updateSyncPage();
      alert('✅ Lernfortschritt wurde zurückgesetzt.');
    });
  }

  updateSyncPage() {
    document.getElementById('total-cards-count').textContent = this.currentCards.length;
  }

  // ===== ALLE KARTEN – Browse-Seite =====
  getFilteredCards() {
    const searchInput = document.getElementById('search-input');
    const searchTerm = searchInput?.value?.toLowerCase() || '';
    return this.currentCards.filter(card => {
      const matchesSearch =
        card.question.toLowerCase().includes(searchTerm) ||
        (card.answer || '').toLowerCase().includes(searchTerm) ||
        card.category.toLowerCase().includes(searchTerm);
      const matchesFilter = !this.activeFilter || card.category === this.activeFilter;
      return matchesSearch && matchesFilter;
    });
  }

  updateBrowsePage() {
    this.renderCategoryFilter();
    this.renderBrowseToolbar();
    this.renderCardList();

    const searchInput = document.getElementById('search-input');
    if (!searchInput._listenerAdded) {
      searchInput.addEventListener('input', () => this.updateBrowsePage());
      searchInput._listenerAdded = true;
    }
  }

  // ===== KAPITEL-FILTER =====
  renderCategoryFilter() {
    const container = document.getElementById('category-filter');
    const categories = [...new Set(this.currentCards.map(c => c.category))].sort();

    container.innerHTML = '';

    if (categories.length === 0) return;

    // "Alle"-Button
    const allBtn = document.createElement('button');
    allBtn.className = 'filter-chip' + (!this.activeFilter ? ' active' : '');
    allBtn.textContent = 'Alle';
    allBtn.addEventListener('click', () => {
      this.activeFilter = null;
      this.updateBrowsePage();
    });
    container.appendChild(allBtn);

    categories.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'filter-chip' + (this.activeFilter === cat ? ' active' : '');
      btn.textContent = cat;
      btn.addEventListener('click', () => {
        this.activeFilter = this.activeFilter === cat ? null : cat;
        this.updateBrowsePage();
      });
      container.appendChild(btn);
    });
  }

  // ===== BROWSE TOOLBAR =====
  renderBrowseToolbar() {
    let toolbar = document.getElementById('browse-toolbar');
    if (!toolbar) {
      toolbar = document.createElement('div');
      toolbar.id = 'browse-toolbar';
      toolbar.className = 'browse-toolbar';
      const filterContainer = document.getElementById('category-filter');
      filterContainer.insertAdjacentElement('afterend', toolbar);
    }

    const count = this.selectedCardIds.size;
    const filtered = this.getFilteredCards();

    if (count === 0) {
      toolbar.innerHTML = '';
      toolbar.style.display = 'none';
      return;
    }

    toolbar.style.display = 'flex';
    const categories = [...new Set(this.currentCards.map(c => c.category))].sort();
    const catOptions = categories.map(c => `<option value="${c}">`).join('');
    const allSelected = filtered.every(c => this.selectedCardIds.has(c.id));

    toolbar.innerHTML = `
      <div class="toolbar-selection-info">
        <strong>${count} ausgewählt</strong>
        <button id="toolbar-select-all" class="btn-chip">
          ${allSelected ? '✕ Alle abwählen' : '☑️ Alle auswählen'}
        </button>
        <button id="toolbar-deselect-all" class="btn-chip btn-chip-muted">Aufheben</button>
      </div>
      <div class="toolbar-actions">
        <button id="toolbar-delete-selected" class="btn-action-danger">
          🗑️ Löschen
        </button>
        <div class="toolbar-category-wrap">
          <input type="text" id="toolbar-category-input"
            list="toolbar-category-suggestions"
            placeholder="Thema zuweisen..."
            class="toolbar-category-input">
          <datalist id="toolbar-category-suggestions">${catOptions}</datalist>
          <button id="toolbar-set-category" class="btn-action-primary">
            🏷️ Setzen
          </button>
        </div>
      </div>
    `;

    document.getElementById('toolbar-select-all').addEventListener('click', () => {
      if (allSelected) {
        filtered.forEach(c => this.selectedCardIds.delete(c.id));
      } else {
        filtered.forEach(c => this.selectedCardIds.add(c.id));
      }
      this.updateBrowsePage();
    });

    document.getElementById('toolbar-deselect-all').addEventListener('click', () => {
      this.selectedCardIds.clear();
      this.updateBrowsePage();
    });

    document.getElementById('toolbar-delete-selected').addEventListener('click', async () => {
      if (confirm(`${count} Karte${count > 1 ? 'n' : ''} wirklich löschen?`)) {
        for (const id of this.selectedCardIds) await db.deleteCard(id);
        this.selectedCardIds.clear();
        await this.loadData();
        this.updateBrowsePage();
      }
    });

    document.getElementById('toolbar-set-category').addEventListener('click', async () => {
      const newCat = document.getElementById('toolbar-category-input').value.trim();
      if (!newCat) { alert('Bitte ein Thema eingeben.'); return; }
      for (const id of this.selectedCardIds) {
        const card = this.currentCards.find(c => c.id === id);
        if (card) { card.category = newCat; await db.saveCard(card); }
      }
      this.selectedCardIds.clear();
      await this.loadData();
      this.updateBrowsePage();
      alert(`✅ Thema für ${count} Karte${count > 1 ? 'n' : ''} geändert.`);
    });
  }

  // ===== KARTENLISTE RENDERN =====
  renderCardList() {
    const list = document.getElementById('cards-list');
    list.innerHTML = '';

    const filtered = this.getFilteredCards();

    if (filtered.length === 0) {
      list.innerHTML = '<p style="color:var(--mid);text-align:center;padding:20px;">Keine Karten gefunden.</p>';
      return;
    }

    filtered.forEach(card => {
      const progress = this.progressMap.get(card.id);
      const isDueToday = !progress || progress.nextReview <= Date.now();
      const isSelected = this.selectedCardIds.has(card.id);

      const item = document.createElement('div');
      item.className = 'card-list-item' + (isSelected ? ' card-selected' : '');
      item.dataset.id = card.id;

      // Swipe nach links → heute fällig
      let touchStartX = 0, touchStartY = 0;
      item.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      }, { passive: true });
      item.addEventListener('touchend', (e) => {
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = Math.abs(e.changedTouches[0].clientY - touchStartY);
        if (dx < -80 && dy < 40) this.markCardDueToday(card.id, item);
      }, { passive: true });

      const hasImages = card.images && card.images.length > 0;
      const answerHTML = card.answer
        ? `<div class="card-list-answer"><strong>Antwort:</strong><br>${cardManager.renderFormulas(card.answer)}</div>`
        : '';
      const imagesHTML = hasImages
        ? card.images.map(src => `<img src="${src}" class="card-list-image zoomable" alt="Kartenbild">`).join('')
        : '';

      item.innerHTML = `
        <div class="card-list-header" data-expanded="false">
          <input type="checkbox" class="card-checkbox" data-id="${card.id}" ${isSelected ? 'checked' : ''}>
          <div class="card-list-header-text">
            <div class="card-list-category">${card.category}</div>
            <div class="card-list-question">${cardManager.renderFormulas(card.question)}</div>
          </div>
          <div class="card-list-header-actions">
            ${!isDueToday
              ? `<button class="btn-icon btn-due-today" title="Heute wiederholen" data-id="${card.id}">📅</button>`
              : `<span class="badge-due">fällig</span>`}
            <button class="btn-icon btn-edit-card" title="Bearbeiten" data-id="${card.id}">✏️</button>
            <button class="btn-icon btn-delete-card" title="Löschen" data-id="${card.id}">🗑️</button>
            <span class="card-list-toggle">▼</span>
          </div>
        </div>
        <div class="card-list-detail hidden">
          ${answerHTML}
          ${hasImages ? `<div class="card-list-images">${imagesHTML}</div>` : ''}
          <div class="card-list-meta">
            ${spacedRep.getNextReviewText(progress)}
            ${card.createdBy ? ` · von: ${card.createdBy}` : ''}
          </div>
          <div class="card-list-swipe-hint">💡 Nach links wischen → heute fällig</div>
        </div>
      `;

      // Aufklappen
      const header = item.querySelector('.card-list-header');
      const detail = item.querySelector('.card-list-detail');
      const toggle = item.querySelector('.card-list-toggle');
      header.addEventListener('click', (e) => {
        if (e.target.closest('.btn-icon')) return;
        if (e.target.closest('.card-checkbox')) return;
        const isExpanded = header.dataset.expanded === 'true';
        detail.classList.toggle('hidden', isExpanded);
        toggle.textContent = isExpanded ? '▼' : '▲';
        header.dataset.expanded = String(!isExpanded);
      });

      // Checkbox
      item.querySelector('.card-checkbox').addEventListener('change', (e) => {
        e.stopPropagation();
        if (e.target.checked) this.selectedCardIds.add(card.id);
        else this.selectedCardIds.delete(card.id);
        item.classList.toggle('card-selected', e.target.checked);
        this.renderBrowseToolbar();
      });

      // Heute fällig
      const dueBtn = item.querySelector('.btn-due-today');
      if (dueBtn) {
        dueBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.markCardDueToday(card.id, item);
        });
      }

      // Bearbeiten
      item.querySelector('.btn-edit-card').addEventListener('click', (e) => {
        e.stopPropagation();
        this.openEditModal(card);
      });

      // Löschen
      item.querySelector('.btn-delete-card').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm(`Karte löschen?\n"${card.question.substring(0, 60)}"`)) {
          await db.deleteCard(card.id);
          await this.loadData();
          this.updateBrowsePage();
        }
      });

      // Bild-Zoom
      item.querySelectorAll('.card-list-image.zoomable').forEach(img => {
        img.addEventListener('click', (e) => { e.stopPropagation(); this._lightboxOpen(img.src); });
      });

      list.appendChild(item);
    });
  }

  // ===== EDIT-MODAL (fixed, über Navbar) =====
  openEditModal(card) {
    document.getElementById('edit-modal')?.remove();

    const categories = [...new Set(this.currentCards.map(c => c.category))].sort();
    const catOptions = categories.map(c => `<option value="${c}">`).join('');

    const modal = document.createElement('div');
    modal.id = 'edit-modal';
    modal.className = 'modal-overlay';

    modal.innerHTML = `
      <div class="modal-box">
        <div class="modal-header">
          <h2>✏️ Karte bearbeiten</h2>
          <button id="edit-modal-close" class="modal-close-btn">✕</button>
        </div>
        <div class="modal-scroll">
          <div class="form-group">
            <label>Kategorie / Thema</label>
            <input type="text" id="edit-category" list="edit-category-suggestions"
              value="${this.escapeHtml(card.category)}" class="edit-input">
            <datalist id="edit-category-suggestions">${catOptions}</datalist>
          </div>
          <div class="form-group">
            <label>Frage</label>
            <textarea id="edit-question" rows="3" class="edit-input">${this.escapeHtml(card.question)}</textarea>
          </div>
          <div class="form-group">
            <label>Antwort</label>
            <textarea id="edit-answer" rows="4" class="edit-input">${this.escapeHtml(card.answer || '')}</textarea>
          </div>
          <div class="form-group">
            <label>Bilder (Antwortseite)</label>
            <div id="edit-image-preview" class="image-preview"></div>
            <button type="button" id="edit-upload-btn" class="btn-secondary" style="margin-top:8px">
              📷 Bild hinzufügen
            </button>
            <input type="file" id="edit-image-input" accept="image/*" multiple class="hidden">
          </div>
        </div>
        <div class="modal-footer">
          <button id="edit-cancel-btn" class="btn-secondary">Abbrechen</button>
          <button id="edit-save-btn" class="btn-primary">💾 Speichern</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    let editImages = [...(card.images || [])];
    const renderEditImages = () => {
      const preview = document.getElementById('edit-image-preview');
      preview.innerHTML = '';
      editImages.forEach((src, i) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'image-preview-item';
        const img = document.createElement('img');
        img.src = src;
        const removeBtn = document.createElement('button');
        removeBtn.textContent = '✕';
        removeBtn.type = 'button';
        removeBtn.onclick = () => { editImages.splice(i, 1); renderEditImages(); };
        wrapper.appendChild(img);
        wrapper.appendChild(removeBtn);
        preview.appendChild(wrapper);
      });
    };
    renderEditImages();

    document.getElementById('edit-upload-btn').addEventListener('click', () => {
      document.getElementById('edit-image-input').click();
    });
    document.getElementById('edit-image-input').addEventListener('change', async (e) => {
      for (const file of e.target.files) {
        const base64 = await cardManager.imageToBase64(file);
        const compressed = await cardManager.compressImage(base64);
        editImages.push(compressed);
      }
      renderEditImages();
    });

    const closeModal = () => modal.remove();
    document.getElementById('edit-modal-close').addEventListener('click', closeModal);
    document.getElementById('edit-cancel-btn').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    document.getElementById('edit-save-btn').addEventListener('click', async () => {
      const newQuestion = document.getElementById('edit-question').value.trim();
      const newAnswer = document.getElementById('edit-answer').value.trim();
      const newCategory = document.getElementById('edit-category').value.trim();

      if (!newQuestion || !newCategory) { alert('Frage und Kategorie dürfen nicht leer sein.'); return; }
      if (!newAnswer && editImages.length === 0) { alert('Bitte Antwort eingeben oder Bild hinzufügen.'); return; }

      await db.saveCard({ ...card, question: newQuestion, answer: newAnswer, category: newCategory, images: editImages, timestamp: new Date().toISOString() });
      await this.loadData();
      closeModal();
      this.updateBrowsePage();
    });
  }

  escapeHtml(str) {
    return (str || '')
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ===== HEUTE FÄLLIG =====
  async markCardDueToday(cardId, itemElement) {
    const progress = this.progressMap.get(cardId) || {};
    await db.saveProgress(cardId, { ...progress, cardId, nextReview: Date.now() - 1000 });
    this.progressMap.set(cardId, { ...progress, cardId, nextReview: Date.now() - 1000 });

    itemElement.classList.add('card-marked-due');
    const btn = itemElement.querySelector('.btn-due-today');
    if (btn) btn.replaceWith(Object.assign(document.createElement('span'), { className: 'badge-due', textContent: '✅ fällig' }));

    await this.loadData();
    document.getElementById('cards-due-badge').textContent = `${this.dueCards.length} fällig`;
  }

  // ===== STATISTIK =====
  updateStats() {
    const now = Date.now();
    const tomorrow = now + 24 * 60 * 60 * 1000;
    const in7days = now + 7 * 24 * 60 * 60 * 1000;

    const due = this.currentCards.filter(c => {
      const p = this.progressMap.get(c.id);
      return !p || p.nextReview <= now;
    });

    const dueTomorrow = this.currentCards.filter(c => {
      const p = this.progressMap.get(c.id);
      return p && p.nextReview > now && p.nextReview <= tomorrow;
    });

    const dueIn7 = this.currentCards.filter(c => {
      const p = this.progressMap.get(c.id);
      return p && p.nextReview > now && p.nextReview <= in7days;
    });

    const learned = Array.from(this.progressMap.values()).filter(p => p.repetitions > 0).length;
    const mastered = Array.from(this.progressMap.values()).filter(p => p.repetitions >= 3).length;

    // Streak berechnen
    const streak = this.calculateStreak();

    document.getElementById('stat-total').textContent = this.currentCards.length;
    document.getElementById('stat-due').textContent = due.length;
    document.getElementById('stat-learned').textContent = learned;
    document.getElementById('stat-streak').textContent = streak;

    // Neue Felder
    const setIfExists = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    setIfExists('stat-tomorrow', dueTomorrow.length);
    setIfExists('stat-week', dueIn7.length);
    setIfExists('stat-mastered', mastered);

    // Kategorie-Statistik
    this.renderCategoryStats();
  }

  calculateStreak() {
    const reviewDays = new Set(
      Array.from(this.progressMap.values())
        .filter(p => p.lastReview)
        .map(p => new Date(p.lastReview).toDateString())
    );

    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      if (reviewDays.has(d.toDateString())) streak++;
      else if (i > 0) break;
    }
    return streak;
  }

  renderCategoryStats() {
    const container = document.getElementById('category-stats');
    if (!container) return;

    const categories = [...new Set(this.currentCards.map(c => c.category))].sort();

    if (categories.length === 0) {
      container.innerHTML = '<p style="color:var(--mid);font-size:14px;">Noch keine Karten vorhanden.</p>';
      return;
    }

    const now = Date.now();
    container.innerHTML = '';

    categories.forEach(cat => {
      const cards = this.currentCards.filter(c => c.category === cat);
      const due = cards.filter(c => {
        const p = this.progressMap.get(c.id);
        return !p || p.nextReview <= now;
      }).length;
      const mastered = cards.filter(c => {
        const p = this.progressMap.get(c.id);
        return p && p.repetitions >= 3;
      }).length;

      const pct = cards.length > 0 ? Math.round((mastered / cards.length) * 100) : 0;

      const row = document.createElement('div');
      row.className = 'category-stat-row';
      row.innerHTML = `
        <div class="category-stat-header">
          <span class="category-stat-name">${cat}</span>
          <span class="category-stat-numbers">${due} fällig · ${mastered}/${cards.length} gemeistert</span>
        </div>
        <div class="category-progress-bar">
          <div class="category-progress-fill" style="width:${pct}%"></div>
        </div>
      `;
      container.appendChild(row);
    });
  }
}

const app = new App();
app.init().catch(console.error);
