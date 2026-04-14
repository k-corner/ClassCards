// js/flashcards.js – Karteikarten erstellen und verwalten

class FlashcardManager {

  // Neue Karteikarte erstellen
  createCard(data) {
    return {
      id: Date.now(),
      question: data.question.trim(),
      answer: data.answer ? data.answer.trim() : '',
      category: data.category.trim(),
      images: data.images || [],        // Antwort-Bilder (Rückseite)
      frontImages: data.frontImages || [], // Frage-Bilder (Vorderseite)
      createdAt: new Date().toISOString(),
      timestamp: new Date().toISOString(),
      createdBy: data.createdBy || 'Anonym'
    };
  }

  // Karteikarte speichern
  async saveCard(data) {
    const card = this.createCard(data);
    await db.saveCard(card);
    return card;
  }

  // Bild als Base64 konvertieren
  async imageToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject('Fehler beim Lesen des Bildes');
      reader.readAsDataURL(file);
    });
  }

  // Bild komprimieren – PNG für maximale Schärfe (besonders bei Formeln/Handschrift)
  async compressImage(base64, maxWidth = 1200) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ratio = Math.min(maxWidth / img.width, 1);
        canvas.width = img.width * ratio;
        canvas.height = img.height * ratio;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        // PNG: verlustfrei, ideal für Formeln und Handschrift
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = base64;
    });
  }

  // Formel-Rendering mit KaTeX
  renderFormulas(text) {
    if (!text) return '';
    return text.replace(/\$\$([^$]+)\$\$/g, (match, formula) => {
      try {
        return katex.renderToString(formula, { throwOnError: false });
      } catch (e) {
        return match;
      }
    });
  }

  // Zeichnen auf Canvas (für handschriftliche Notizen)
  setupCanvas(canvas) {
    const ctx = canvas.getContext('2d');
    let isDrawing = false;
    let lastX = 0;
    let lastY = 0;

    const getPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      if (e.touches) {
        return {
          x: (e.touches[0].clientX - rect.left) * scaleX,
          y: (e.touches[0].clientY - rect.top) * scaleY
        };
      }
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
      };
    };

    const startDrawing = (e) => {
      e.preventDefault();
      isDrawing = true;
      const pos = getPos(e);
      lastX = pos.x;
      lastY = pos.y;
    };

    const draw = (e) => {
      e.preventDefault();
      if (!isDrawing) return;
      const pos = getPos(e);
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(pos.x, pos.y);
      ctx.strokeStyle = document.getElementById('pen-color')?.value || '#000';
      ctx.lineWidth = document.getElementById('pen-size')?.value || 3;
      ctx.lineCap = 'round';
      ctx.stroke();
      lastX = pos.x;
      lastY = pos.y;
    };

    const stopDrawing = () => { isDrawing = false; };

    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('touchstart', startDrawing, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
    canvas.addEventListener('touchend', stopDrawing);

    return ctx;
  }

  // Canvas als PNG exportieren (verlustfrei)
  canvasToBase64(canvas) {
    return canvas.toDataURL('image/png');
  }
}

const cardManager = new FlashcardManager();
