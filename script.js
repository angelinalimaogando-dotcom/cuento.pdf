// Configuración del worker de PDF.js
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
let pageTexts = []; 
const synth = window.speechSynthesis;

// Precargar voces cuando estén disponibles
let availableVoices = [];
function loadVoices() {
    availableVoices = synth.getVoices();
}
loadVoices();
if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = loadVoices;
}

// 1. Cargar el PDF automáticamente desde el repo
document.addEventListener('DOMContentLoaded', () => {
    fetchAndLoadPDF('./cuento.pdf');
});

async function fetchAndLoadPDF(pdfUrl) {
    try {
        const response = await fetch(pdfUrl);
        if (!response.ok) {
            throw new Error(`No se encontró el archivo: ${pdfUrl}`);
        }
        const pdfData = await response.arrayBuffer();
        await renderBook(pdfData);
    } catch (error) {
        console.error('Error al cargar el PDF:', error);
        loading.innerHTML = `<p style="color:#d63031;">⚠️ No se pudo cargar 'cuento.pdf'.<br>Verifica que esté alojado en la raíz del repositorio.</p>`;
    }
}

// 2. Procesar y renderizar el cuento
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

        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            const page = await pdfDoc.getPage(pageNum);
            
            // Extraer y limpiar el texto para una voz clara
            const textContent = await page.getTextContent();
            const rawText = textContent.items.map(item => item.str).join(' ');
            const cleanText = cleanTextForSpeech(rawText);
            pageTexts.push(cleanText);

            // Renderizar la página en Canvas
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

        // Inicializar el Flipbook
        pageFlip = new St.PageFlip(bookContainer, {
            width: pageWidth,
            height: pageHeight,
            size: "stretch",
            minWidth: 300,
            maxWidth: pageWidth,
            minHeight: 400,
            maxHeight: pageHeight,
            showCover: true,
            maxShadowOpacity: 0.4,
            usePortrait: true
        });

        const pages = document.querySelectorAll('.page');
        pageFlip.loadFromHTML(pages);

        // Eventos al cambiar página
        pageFlip.on('flip', (e) => {
            playFlipSound();
            stopSpeech();
            updateNavigationUI(e.data, totalPages);
        });

        updateNavigationUI(0, totalPages);

    } catch (error) {
        console.error('Error renderizando el cuento:', error);
        loading.innerText = 'Error al procesar las páginas del cuento.';
    }
}

// Limpia el texto extraído para evitar pausas extrañas o lecturas distorsionadas
function cleanTextForSpeech(text) {
    if (!text || text.trim() === '') return '';
    return text
        .replace(/\s+/g, ' ')           // Eliminar espacios y saltos de línea repetidos
        .replace(/([.?!])\s*/g, '$1 ')  // Asegurar espacio tras signos de puntuación
        .trim();
}

// 3. Efecto de Sonido de Página
function playFlipSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const bufferSize = audioCtx.sampleRate * 0.12;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.25));
        }

        const noise = audioCtx.createBufferSource();
        noise.buffer = buffer;

        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(750, audioCtx.currentTime);

        noise.connect(filter);
        filter.connect(audioCtx.destination);

        noise.start();
    } catch (e) {
        // Silencioso si el navegador no permite audio automático
    }
}

// 4. Navegación
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

// 6. Lectura en Voz Alta Clara y Nítida en Español
btnReadAloud.addEventListener('click', () => {
    if (synth.speaking) {
        stopSpeech();
        return;
    }

    if (!pageFlip) return;

    const currentPageIndex = pageFlip.getCurrentPageIndex();
    const textToRead = pageTexts[currentPageIndex];

    if (!textToRead || textToRead.trim() === '') {
        alert("En esta página no se detectó texto para leer.");
        return;
    }

    const utterance = new SpeechSynthesisUtterance(textToRead);
    utterance.lang = 'es-ES';
    utterance.rate = 0.85;  // Velocidad pausada para favorecer la claridad en niños
    utterance.pitch = 1.1;   // Tono ligeramente más cálido y amigable

    // Selección de la voz más clara en español
    if (availableVoices.length === 0) {
        availableVoices = synth.getVoices();
    }

    // Priorizar voces naturales o en español neutro/España
    const selectedVoice = availableVoices.find(v => v.lang.startsWith('es') && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Microsoft'))) 
                        || availableVoices.find(v => v.lang.startsWith('es'));

    if (selectedVoice) {
        utterance.voice = selectedVoice;
    }

    utterance.onstart = () => {
        btnReadAloud.classList.add('reading');
        btnReadAloud.innerText = '⏹ Detener Lectura';
    };

    utterance.onend = () => stopSpeechUI();
    utterance.onerror = () => stopSpeechUI();

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