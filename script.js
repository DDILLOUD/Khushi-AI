// PDF.js initialization
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.9.359/pdf.worker.min.js';

// Global variables
let pdfDoc = null;
let pageNum = 1;
let pageRendering = false;
let pageNumPending = null;
let scale = 1.5;
let canvas = document.createElement('canvas');
let ctx = canvas.getContext('2d');
let annotations = [];

// DOM elements
const queryInput = document.getElementById('query');
const submitQueryBtn = document.getElementById('submit-query');
const responseDiv = document.getElementById('response');
const queryHistory = document.getElementById('query-history');
const uploadBtn = document.getElementById('upload-btn');
const fileInput = document.getElementById('file-input');
const dropZone = document.getElementById('drop-zone');
const pdfRender = document.getElementById('pdf-render');
const prevPageBtn = document.getElementById('prev-page');
const nextPageBtn = document.getElementById('next-page');
const zoomInBtn = document.getElementById('zoom-in');
const zoomOutBtn = document.getElementById('zoom-out');
const pageInfo = document.getElementById('page-info');
const annotationList = document.getElementById('annotation-list');
const saveAnnotationsBtn = document.getElementById('save-annotations');
const addBulletBtn = document.getElementById('add-bullet');

// Tab switching
document.querySelectorAll('nav a').forEach(link => {
    link.addEventListener('click', function(e) {
        e.preventDefault();
        document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
        document.querySelector(this.getAttribute('href')).classList.add('active');
        document.querySelectorAll('nav a').forEach(navLink => navLink.classList.remove('active'));
        this.classList.add('active');
        adjustLayout();
    });
});

// GPT Query Submission
submitQueryBtn.addEventListener('click', submitQuery);

function submitQuery() {
    const query = queryInput.value;
    fetch('/gpt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query }),
    })
    .then(response => response.json())
    .then(data => {
        responseDiv.innerText = data.response;
        addToQueryHistory(query);
    });
}

function addToQueryHistory(query) {
    const li = document.createElement('li');
    li.textContent = query;
    queryHistory.appendChild(li);
}

// PDF Upload and Viewing
uploadBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', handleFileSelect);
dropZone.addEventListener('dragover', handleDragOver);
dropZone.addEventListener('dragleave', handleDragLeave);
dropZone.addEventListener('drop', handleDrop);

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file.type !== 'application/pdf') {
        alert('Please upload a PDF file.');
        return;
    }
    uploadFile(file);
}

function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    this.classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    this.classList.remove('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    this.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file.type !== 'application/pdf') {
        alert('Please upload a PDF file.');
        return;
    }
    uploadFile(file);
}

function uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);

    fetch('/upload', {
        method: 'POST',
        body: formData,
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            loadPDF();
            adjustLayout();
        } else {
            alert(data.error);
        }
    });
}

function loadPDF() {
    pdfjsLib.getDocument('/get_pdf').promise.then(function(pdf) {
        pdfDoc = pdf;
        pageInfo.textContent = `Page ${pageNum} of ${pdf.numPages}`;
        renderPage(pageNum);
    });
}

function renderPage(num) {
    pageRendering = true;
    pdfDoc.getPage(num).then(function(page) {
        let viewport = page.getViewport({ scale: scale });
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        let renderContext = {
            canvasContext: ctx,
            viewport: viewport
        };
        let renderTask = page.render(renderContext);

        renderTask.promise.then(function() {
            pageRendering = false;
            if (pageNumPending !== null) {
                renderPage(pageNumPending);
                pageNumPending = null;
            }
            pdfRender.innerHTML = '';
            pdfRender.appendChild(canvas);
            setupTextSelection(page, viewport);
        });
    });

    pageInfo.textContent = `Page ${num} of ${pdfDoc.numPages}`;
}

prevPageBtn.addEventListener('click', onPrevPage);
nextPageBtn.addEventListener('click', onNextPage);
zoomInBtn.addEventListener('click', onZoomIn);
zoomOutBtn.addEventListener('click', onZoomOut);

function onPrevPage() {
    if (pageNum <= 1) return;
    pageNum--;
    queueRenderPage(pageNum);
}

function onNextPage() {
    if (pageNum >= pdfDoc.numPages) return;
    pageNum++;
    queueRenderPage(pageNum);
}

function onZoomIn() {
    scale *= 1.2;
    queueRenderPage(pageNum);
}

function onZoomOut() {
    scale /= 1.2;
    queueRenderPage(pageNum);
}

function queueRenderPage(num) {
    if (pageRendering) {
        pageNumPending = num;
    } else {
        renderPage(num);
    }
}

// Text selection and annotation
let selectedText = '';
let textLayer = null;

function setupTextSelection(page, viewport) {
    textLayer = document.createElement('div');
    textLayer.setAttribute('class', 'textLayer');
    textLayer.style.width = `${viewport.width}px`;
    textLayer.style.height = `${viewport.height}px`;
    pdfRender.appendChild(textLayer);

    page.getTextContent().then(function(textContent) {
        pdfjsLib.renderTextLayer({
            textContent: textContent,
            container: textLayer,
            viewport: viewport,
            textDivs: []
        });
    });

    textLayer.addEventListener('mouseup', endSelection);
    textLayer.addEventListener('touchend', endSelection);
}

function endSelection(e) {
    const selection = window.getSelection();
    selectedText = selection.toString().trim();
    if (selectedText) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const pdfRect = pdfRender.getBoundingClientRect();
        const position = {
            x: (rect.left - pdfRect.left) / scale,
            y: (rect.top - pdfRect.top) / scale,
            pageNum: pageNum
        };
        highlightSelectedText(selection);
        addAnnotation(selectedText, position);
    }
}

function highlightSelectedText(selection) {
    const range = selection.getRangeAt(0);
    const highlight = document.createElement('span');
    highlight.className = 'highlight';
    highlight.style.backgroundColor = 'yellow';
    range.surroundContents(highlight);
}

function addAnnotation(text, position) {
    const annotationItem = document.createElement('div');
    annotationItem.className = 'annotation-item';

    const bullet = document.createElement('span');
    bullet.className = 'bullet';
    bullet.textContent = '• ';
    bullet.addEventListener('click', () => navigateToPDFLocation(position));

    const textSpan = document.createElement('span');
    textSpan.textContent = text;
    textSpan.contentEditable = true;
    textSpan.addEventListener('blur', () => {
        text = textSpan.textContent;
    });

    const commentBox = document.createElement('textarea');
    commentBox.className = 'comment-box';
    commentBox.placeholder = 'Add a comment...';

    const deleteButton = document.createElement('button');
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', () => {
        annotationList.removeChild(annotationItem);
        removeHighlight(text);
    });

    annotationItem.appendChild(bullet);
    annotationItem.appendChild(textSpan);
    annotationItem.appendChild(commentBox);
    annotationItem.appendChild(deleteButton);

    annotationList.appendChild(annotationItem);

    annotations.push({ text, position, element: annotationItem });
}

function navigateToPDFLocation(position) {
    if (pageNum !== position.pageNum) {
        pageNum = position.pageNum;
        renderPage(pageNum);
    }

    setTimeout(() => {
        const targetX = position.x * scale;
        const targetY = position.y * scale;
        pdfRender.scrollTo(targetX, targetY);
    }, 100);
}

function removeHighlight(text) {
    const highlights = textLayer.querySelectorAll('.highlight');
    highlights.forEach(highlight => {
        if (highlight.textContent === text) {
            const parent = highlight.parentNode;
            while (highlight.firstChild) {
                parent.insertBefore(highlight.firstChild, highlight);
            }
            parent.removeChild(highlight);
        }
    });
}

addBulletBtn.addEventListener('click', () => {
    const position = { x: 0, y: 0, pageNum: pageNum };
    addAnnotation('New bullet point', position);
});

saveAnnotationsBtn.addEventListener('click', saveAnnotations);

function saveAnnotations() {
    const annotationsData = annotations.map(ann => ({
        text: ann.element.querySelector('span:nth-child(2)').textContent,
        comment: ann.element.querySelector('.comment-box').value,
        position: ann.position
    }));

    fetch('/save_annotation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annotations: annotationsData }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert('Annotations saved successfully!');
        } else {
            alert('Error saving annotations.');
        }
    });
}

function adjustLayout() {
    const pdfContainer = document.querySelector('.pdf-annotation-container');
    const pdfViewer = document.querySelector('.pdf-viewer');
    const annotationSection = document.querySelector('.annotation-section');

    pdfContainer.style.height = `calc(100vh - ${pdfContainer.offsetTop}px)`;
    pdfViewer.style.height = '100%';
    annotationSection.style.height = '100%';

    const saveButton = document.getElementById('save-annotations');
    annotationList.style.height = `calc(100% - ${saveButton.offsetHeight}px - 2rem)`;
}

window.addEventListener('resize', adjustLayout);
window.addEventListener('load', adjustLayout);