const DB_NAME = 'LernkartenDB';
const DB_VERSION = 1;

class Database {
  constructor() {
    this.db = null;
  }

  // Datenbank öffnen / initialisieren
  async open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Tabelle für Karteikarten
        if (!db.objectStoreNames.contains('flashcards')) {
          const store = db.createObjectStore('flashcards', { keyPath: 'id' });
          store.createIndex('category', 'category', { unique: false });
          store.createIndex('nextReview', 'nextReview', { unique: false });
        }

        // Tabelle für Lernfortschritt
        if (!db.objectStoreNames.contains('progress')) {
          db.createObjectStore('progress', { keyPath: 'cardId' });
        }

        // Tabelle für App-Einstellungen
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        reject('Datenbankfehler: ' + event.target.error);
      };
    });
  }

  // Alle Karteikarten abrufen
  async getAllCards() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('flashcards', 'readonly');
      const store = tx.objectStore('flashcards');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Karteikarte speichern (neu oder aktualisieren)
  async saveCard(card) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('flashcards', 'readwrite');
      const store = tx.objectStore('flashcards');
      const request = store.put(card);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Karteikarte löschen
  async deleteCard(id) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('flashcards', 'readwrite');
      const store = tx.objectStore('flashcards');
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Lernfortschritt für eine Karte speichern
  async saveProgress(cardId, progressData) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('progress', 'readwrite');
      const store = tx.objectStore('progress');
      const request = store.put({ cardId, ...progressData });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Gesamten Lernfortschritt abrufen
  async getAllProgress() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('progress', 'readonly');
      const store = tx.objectStore('progress');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Einstellung speichern
  async setSetting(key, value) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('settings', 'readwrite');
      const store = tx.objectStore('settings');
      const request = store.put({ key, value });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Einstellung abrufen
  async getSetting(key) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('settings', 'readonly');
      const store = tx.objectStore('settings');
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result?.value);
      request.onerror = () => reject(request.error);
    });
  }

  // Mehrere Karten gleichzeitig speichern (für Import)
  async bulkSaveCards(cards) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('flashcards', 'readwrite');
      const store = tx.objectStore('flashcards');
      let count = 0;
      cards.forEach(card => {
        const request = store.put(card);
        request.onsuccess = () => {
          count++;
          if (count === cards.length) resolve(count);
        };
        request.onerror = () => reject(request.error);
      });
      if (cards.length === 0) resolve(0);
    });
  }


  // Gesamten Lernfortschritt löschen
  async clearProgress() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('progress', 'readwrite');
      const store = tx.objectStore('progress');
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

}

// Globale Datenbankinstanz
const db = new Database();
