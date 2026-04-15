// js/sync.js – Import und Export der Datenbank

class SyncManager {

  // ===== EXPORT =====

  // Gesamte Karteidatenbank exportieren (für ByCS Drive)
  async exportDatabase() {
    const cards = await db.getAllCards();
    const exportData = {
      version: '1.0',
      appName: 'LernkartenApp',
      exportedAt: new Date().toISOString(),
      cardCount: cards.length,
      cards: cards
    };

    const json = JSON.stringify(exportData, null, 2);
    const date = new Date().toISOString().split('T')[0];
    this.downloadFile(json, `lernkarten-${date}.json`, 'application/json');
    return cards.length;
  }

  // Persönlichen Lernfortschritt exportieren
  async exportProgress() {
    const progress = await db.getAllProgress();
    const settings = await db.getSetting('userPrefs');
    const exportData = {
      version: '1.0',
      type: 'progress',
      exportedAt: new Date().toISOString(),
      progress: progress,
      settings: settings
    };

    const json = JSON.stringify(exportData, null, 2);
    this.downloadFile(json, 'mein-lernfortschritt.json', 'application/json');
  }

  // ===== IMPORT =====

  // ===== NEUE METHODE: JSON-Validierung =====
  validateImportData(data) {
    // Grundstruktur prüfen
    if (typeof data !== 'object' || data === null)
      throw new Error('Ungültiges Format: Kein gültiges JSON-Objekt.');
    if (!Array.isArray(data.cards))
      throw new Error('Ungültiges Format: "cards" fehlt oder ist kein Array.');
    if (data.cards.length > 10000)
      throw new Error('Zu viele Karten (max. 10.000).');

    // Jede Karte einzeln prüfen
    data.cards.forEach((card, index) => {
      if (typeof card !== 'object' || card === null)
        throw new Error(`Karte ${index}: Ungültiges Format.`);
      if (typeof card.id !== 'number')
        throw new Error(`Karte ${index}: Ungültige ID.`);
      if (typeof card.question !== 'string' || card.question.trim() === '')
        throw new Error(`Karte ${index}: Frage fehlt oder ist leer.`);
      if (card.question.length > 5000)
        throw new Error(`Karte ${index}: Frage zu lang (max. 5000 Zeichen).`);
      if (card.answer && typeof card.answer !== 'string')
        throw new Error(`Karte ${index}: Antwort ungültig.`);
      if (card.images && !Array.isArray(card.images))
        throw new Error(`Karte ${index}: Bilder-Format ungültig.`);

      // Bilder: Nur echte Base64-Bilder erlauben
      if (card.images) {
        card.images.forEach((img, imgIndex) => {
          if (typeof img !== 'string')
            throw new Error(`Karte ${index}, Bild ${imgIndex}: Kein String.`);
          if (!img.startsWith('data:image/'))
            throw new Error(`Karte ${index}, Bild ${imgIndex}: Kein gültiges Bild-Format.`);
          // Maximale Bildgröße: 5MB pro Bild
          if (img.length > 7 * 1024 * 1024)
            throw new Error(`Karte ${index}, Bild ${imgIndex}: Bild zu groß (max. 5 MB).`);
        });
      }
    });

    return true;
  }
  // ===== ENDE NEUE METHODE =====



  // Karteidatenbank importieren (Merge mit lokalen Daten)
  async importDatabase(file) {
    const text = await file.text();
    let importData;

    try {
      importData = JSON.parse(text);
    } catch (e) {
      throw new Error('Ungültige Datei: Kein gültiges JSON-Format');
    }

    if (!importData.cards || !Array.isArray(importData.cards)) {
      throw new Error('Ungültiges Format: Keine Karteikarten gefunden');
    }

    // ===== NEU: VOLLSTÄNDIGE VALIDIERUNG =====
    this.validateImportData(importData);


    // Lokale Karten laden
    const localCards = await db.getAllCards();
    const localMap = new Map(localCards.map(c => [c.id, c]));

    // Merge: Importierte Karten mit lokalen zusammenführen
    let newCount = 0;
    let updatedCount = 0;

    importData.cards.forEach(importedCard => {
      if (!localMap.has(importedCard.id)) {
        localMap.set(importedCard.id, importedCard);
        newCount++;
      } else {
        // Neuere Version gewinnt
        const local = localMap.get(importedCard.id);
        const importedTime = new Date(importedCard.timestamp || 0).getTime();
        const localTime = new Date(local.timestamp || 0).getTime();
        if (importedTime > localTime) {
          localMap.set(importedCard.id, importedCard);
          updatedCount++;
        }
      }
    });

    // Zusammengeführte Karten speichern
    const mergedCards = Array.from(localMap.values());
    await db.bulkSaveCards(mergedCards);

    return {
      total: mergedCards.length,
      new: newCount,
      updated: updatedCount
    };
  }

  // Lernfortschritt importieren
  async importProgress(file) {
    const text = await file.text();
    let importData;

    try {
      importData = JSON.parse(text);
    } catch (e) {
      throw new Error('Ungültige Datei');
    }

    if (importData.type !== 'progress' || !importData.progress) {
      throw new Error('Keine gültige Fortschrittsdatei');
    }

    for (const prog of importData.progress) {
      await db.saveProgress(prog.cardId, prog);
    }

    return importData.progress.length;
  }

  // ===== HILFSFUNKTIONEN =====

  // Datei herunterladen
  downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

const syncManager = new SyncManager();
