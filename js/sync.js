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
