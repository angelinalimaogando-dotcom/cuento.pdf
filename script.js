// Ruta del worker de PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// Elementos del DOM
const bookContainer = document.getElementById('flip-book');
const bookWrapper = document.querySelector('.book-wrapper');
const loading = document.getElementById('loading');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const btnReadAloud = document.getElementById('btn-read-aloud');
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');
const pageCounter = document.getElementById('page-counter');

let pageFlip = null;
let pdfDoc = null;
let currentZoom = 1;
let pageTexts = []; // Almacenará el texto extraído de cada página para lectura en voz alta
const synth = window.speechSynthesis;

// 1. Carga automática al abrir la página
document.addEventListener('DOMContentLoaded', () => {
    fetchAndLoadPDF('./cuento.pdf');
});

// Función para descargar y procesar el PDF del repositorio
async function fetchAndLoadPDF(pdfUrl) {
    try {
        const response = await fetch(pdfUrl);
        if (!response.ok) {
            throw new Error(`No se pudo encontrar el cuento en: ${pdfUrl}`);
        }
        const pdfData = await response.arrayBuffer();
        await renderBook(pdfData);
    } catch (error) {
        console.error('Error al cargar el PDF:', error);
        loading.innerHTML = `<p style="color:#ee5253;">⚠️ No se pudo cargar el cuento.<br>Asegúrate de que 'cuento.pdf' está alojado en la raíz del repositorio.</p>`;
    }
}

// 2. Renderizar el PDF en la librería FlipBook
async function renderBook(pdfData) {
    try {
        pdfDoc = await pdfjsLib.getDocument(pdfData).promise;
        const totalPages = pdfDoc.numPages;
        
        const firstPage = await pdfDoc.getPage(1);
        const viewportInfo = firstPage.getViewport({ scale: 1.5 });
        const pageWidth = viewportInfo.width;
        const pageHeight = viewportInfo.height;

        bookContainer.innerHTML = '';
        pageTexts = [];

        // Procesar todas las páginas
        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            const page = await pdfDoc.getPage(pageNum);
            
            // Extraer texto para síntesis de voz
            const textContent = await page.getTextContent();
            const textItems = textContent.items.map(item => item.str).join(' ');
            pageTexts.push(textItems || "Esta página no contiene texto legible.");

            // Renderizado visual en canvas
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({ canvasContext: context, viewport: viewport }).promise;

            const pageDiv = document.createElement('div');
            pageDiv.className = 'page';
            pageDiv.appendChild(canvas);
            bookContainer.appendChild(pageDiv);
        }

        loading.style.display = 'none';
        bookContainer.style.display = 'block';

        // Inicializar St.PageFlip
        pageFlip = new St.PageFlip(bookContainer, {
            width: pageWidth,
            height: pageHeight,
            size: "stretch",
            minWidth: 300,
            maxWidth: pageWidth,
            minHeight: 400,
            maxHeight: pageHeight,
            showCover: true,
            maxShadowOpacity: 0.5,
            usePortrait: true
        });

        const pages = document.querySelectorAll('.page');
        pageFlip.loadFromHTML(pages);

        // Eventos al cambiar de página
        pageFlip.on('flip', (e) => {
            playFlipSound(); // Efecto de sonido
            stopSpeech();    // Detener audio si cambia de página
            updateNavigationUI(e.data, totalPages);
        });

        // Configuración inicial de UI
        updateNavigationUI(0, totalPages);

    } catch (error) {
        console.error('Error renderizando las páginas:', error);
        loading.innerText = 'Error al procesar las páginas del cuento.';
    }
}

// 3. Efecto de Sonido Sintético (Giro de Hoja)
function playFlipSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const bufferSize = audioCtx.sampleRate * 0.15; // 150ms
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
        }

        const noise = audioCtx.createBufferSource();
        noise.buffer = buffer;

        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, audioCtx.currentTime);

        noise.connect(filter);
        filter.connect(audioCtx.destination);

        noise.start();
    } catch (e) {
        // Ignorar restricciones de audio del navegador si aplican
    }
}

// 4. Navegación por Botones
btnPrev.addEventListener('click', () => {
    if (pageFlip) pageFlip.flipPrev();
});

btnNext.addEventListener('click', () => {
    if (pageFlip) pageFlip.flipNext();
});

function updateNavigationUI(currentPageIndex, totalPages) {
    const displayedPage = currentPageIndex + 1;
    pageCounter.innerText = `Página ${displayedPage} de ${totalPages}`;
    btnPrev.disabled = currentPageIndex === 0;
    btnNext.disabled = currentPageIndex >= totalPages - 1;
}

// 5. Controles de Zoom para Baja Visión
btnZoomIn.addEventListener('click', () => {
    if (currentZoom < 1.6) {
        currentZoom += 0.15;
        applyZoom();
    }
});

btnZoomOut.addEventListener('click', () => {
    if (currentZoom > 0.7) {
        currentZoom -= 0.15;
        applyZoom();
    }
});

function applyZoom() {
    bookWrapper.style.transform = `scale(${currentZoom})`;
}

// 6. Lectura en Voz Alta (Text-to-Speech) en Español
btnReadAloud.addEventListener('click', () => {
    if (synth.speaking) {
        stopSpeech();
        return;
    }

    if (!pageFlip) return;

    const currentPageIndex = pageFlip.getCurrentPageIndex();
    const textToRead = pageTexts[currentPageIndex];

    if (!textToRead || textToRead.trim() === '') {
        alert("No se detectó texto en esta página.");
        return;
    }

    const utterance = new SpeechSynthesisUtterance(textToRead);
    utterance.lang = 'es-ES'; // Idioma español
    utterance.rate = 0.9;     // Velocidad moderada ideal para niños

    const voices = synth.getVoices();
    const spanishVoice = voices.find(v => v.lang.startsWith('es'));
    if (spanishVoice) {
        utterance.voice = spanishVoice;
    }

    utterance.onstart = () => {
        btnReadAloud.classList.add('reading');
        btnReadAloud.innerText = '⏹ Detener Lectura';
    };

    utterance.onend = () => {
        stopSpeechUI();
    };

    utterance.onerror = () => {
        stopSpeechUI();
    };

    synth.speak(utterance);
});

function stopSpeech() {
    if (synth.speaking) {
        synth.cancel();
    }
    stopSpeechUI();
}

function stopSpeechUI() {
    btnReadAloud.classList.remove('reading');
    btnReadAloud.innerText = '🔊 Leer en Voz Alta';
}