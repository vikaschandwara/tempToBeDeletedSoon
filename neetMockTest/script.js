// ==========================================
// 1. CONFIGURATION & STATE
// ==========================================
const PDF_URL = 'paper.pdf';

// SCALING LOGIC FOR ZOOM EFFECT
const TAGGER_SCALE = 1.5; // The scale you used in the Tagger Tool (do not change)
const VIEW_SCALE = 2.5;   // New Zoom level (Higher = Bigger Text)

const TOTAL_QUESTIONS = 180;
const TEST_DURATION_SECONDS = 3 * 60 * 60;

let pdfDoc = null;
let currentQIndex = 0;
let userResponses = new Array(TOTAL_QUESTIONS).fill(null);
let visitedQuestions = new Array(TOTAL_QUESTIONS).fill(false);
let timerInterval;
let startTime = Date.now();
let currentPageRendered = 0;

// DOM Elements
const canvas = document.getElementById('the-canvas');
const ctx = canvas.getContext('2d');
const pdfContainer = document.getElementById('pdf-container');
const ui = {
    qNum: document.getElementById('disp-q-num'),
    timer: document.getElementById('timer'),
    palette: document.getElementById('question-palette'),
    options: document.querySelectorAll('.opt-btn'),
    testInterface: document.getElementById('test-interface'),
    resultScreen: document.getElementById('result-screen'),
    finishBtn: document.getElementById('finish-btn')
};

// ==========================================
// 2. INITIALIZATION
// ==========================================
async function init() {
    generatePalette();
    try {
        const loadingTask = pdfjsLib.getDocument(PDF_URL);
        pdfDoc = await loadingTask.promise;
        loadQuestion(0);
        startTimer();
    } catch (err) {
        alert("Error loading PDF. Ensure 'paper.pdf' is in the folder.");
        console.error(err);
    }
}

// ==========================================
// 3. CORE LOGIC: PDF RENDER & ZOOM SCROLL
// ==========================================
function generatePalette() {
    ui.palette.innerHTML = '';
    for (let i = 0; i < TOTAL_QUESTIONS; i++) {
        const btn = document.createElement('button');
        btn.className = 'p-btn';
        btn.textContent = i + 1;
        btn.onclick = () => loadQuestion(i);
        btn.id = `palette-btn-${i}`;
        ui.palette.appendChild(btn);
    }
}

async function loadQuestion(index) {
    if (index < 0 || index >= TOTAL_QUESTIONS) return;

    currentQIndex = index;
    visitedQuestions[index] = true;
    updatePaletteUI();
    updateOptionUI();
    ui.qNum.textContent = index + 1;

    // --- COORDINATE LOGIC ---
    // Get the raw coordinate from your file
    const coord = QUESTION_LOCATIONS.find(item => item.s_no === (index + 1));

    if (coord) {
        await renderPage(coord.page);

        // --- MATH TO FIX ZOOM SCROLL ---
        // 1. Calculate the ratio between current view and tagger view
        const scaleRatio = VIEW_SCALE / TAGGER_SCALE;
        // 2. Adjust the Y position
        const adjustedY = coord.y * scaleRatio;

        // 3. Scroll there (subtract 30px for padding)
        pdfContainer.scrollTo({
            top: adjustedY - 30,
            behavior: 'auto' // Instant jump, 'smooth' can be dizzying
        });
    } else {
        console.warn("Coordinate not found for Q" + (index + 1));
    }
}

async function renderPage(pageNum) {
    if (currentPageRendered === pageNum) return;

    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: VIEW_SCALE }); // Use High Zoom

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    const renderContext = {
        canvasContext: ctx,
        viewport: viewport
    };

    await page.render(renderContext).promise;
    currentPageRendered = pageNum;
}

function navigate(dir) {
    loadQuestion(currentQIndex + dir);
}

// ==========================================
// 4. USER INTERACTION
// ==========================================
function selectOption(opt) {
    userResponses[currentQIndex] = opt;
    updateOptionUI();
    updatePaletteUI();
}

function clearSelection() {
    userResponses[currentQIndex] = null;
    updateOptionUI();
    updatePaletteUI();
}

function updateOptionUI() {
    const currentAns = userResponses[currentQIndex];
    ui.options.forEach(btn => {
        btn.classList.remove('selected');
        if (btn.textContent === currentAns) {
            btn.classList.add('selected');
        }
    });
}

function updatePaletteUI() {
    for (let i = 0; i < TOTAL_QUESTIONS; i++) {
        const btn = document.getElementById(`palette-btn-${i}`);
        btn.className = 'p-btn';
        if (i === currentQIndex) btn.classList.add('active');
        else btn.classList.remove('active');

        if (userResponses[i] !== null) btn.classList.add('answered');
        else if (visitedQuestions[i]) btn.classList.add('visited');
    }
}

// ==========================================
// 5. TIMER
// ==========================================
function startTimer() {
    let timeLeft = TEST_DURATION_SECONDS;
    ui.timer.textContent = formatTime(timeLeft);

    timerInterval = setInterval(() => {
        timeLeft--;
        ui.timer.textContent = formatTime(timeLeft);
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            submitTest();
        }
    }, 1000);
}

function formatTime(seconds) {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
}

// ==========================================
// 6. SUBMISSION LOGIC (FIXED)
// ==========================================
ui.finishBtn.addEventListener('click', () => {
    if (confirm("Are you sure you want to submit the test?")) {
        submitTest();
    }
});

function submitTest() {
    // 1. Stop Everything
    clearInterval(timerInterval);
    const timeTakenSeconds = Math.floor((Date.now() - startTime) / 1000);

    // 2. Calculate Score
    let correct = 0, wrong = 0, unattempted = 0;
    let wrongLog = [];

    for (let i = 0; i < TOTAL_QUESTIONS; i++) {
        const userAns = userResponses[i];
        // Ensure ANSWER_KEY exists and has data
        const keyItem = typeof ANSWER_KEY !== 'undefined' ? ANSWER_KEY.find(k => k.q === (i + 1)) : null;
        const correctAns = keyItem ? keyItem.ans : null;

        if (userAns === null) {
            unattempted++;
        } else if (userAns === correctAns) {
            correct++;
        } else {
            wrong++;
            wrongLog.push({ q: i + 1, user: userAns, correct: correctAns || 'N/A' });
        }
    }

    const totalScore = (correct * 4) - (wrong * 1);
    const accuracy = correct + wrong > 0 ? ((correct / (correct + wrong)) * 100).toFixed(1) : 0;

    // 3. Update Global Data for PDF Generator
    window.testResultData = {
        score: totalScore,
        correct, wrong, unattempted,
        time: formatTime(timeTakenSeconds),
        wrongLog
    };

    // 4. Switch to Result Screen
    ui.testInterface.style.display = 'none';
    document.querySelector('header').style.display = 'none'; // Hide header
    ui.resultScreen.style.display = 'block';

    // 5. Populate Result HTML
    document.getElementById('res-score').textContent = `${totalScore} / 720`;
    document.getElementById('res-time').textContent = formatTime(timeTakenSeconds);
    document.getElementById('res-accuracy').textContent = `${accuracy}%`;

    const listContainer = document.getElementById('wrong-answers-list');
    listContainer.innerHTML = '';

    if (wrongLog.length === 0) {
        listContainer.innerHTML = '<p style="color:green">Perfect Score!</p>';
    } else {
        wrongLog.forEach(item => {
            const div = document.createElement('div');
            div.className = 'wrong-item';
            div.innerHTML = `<span>Q${item.q}</span> 
                             <span>You: <b style="color:red">${item.user}</b></span> 
                             <span>Ans: <b style="color:green">${item.correct}</b></span>`;
            listContainer.appendChild(div);
        });
    }

    // 6. TRIGGER AUTO DOWNLOADS
    setTimeout(() => {
        downloadResultPDF(); // Download Report
        downloadQuestionPaper(); // Download Paper
    }, 1000);
}

// ==========================================
// 7. DOWNLOAD FUNCTIONS
// ==========================================
function downloadResultPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const data = window.testResultData;

    doc.setFontSize(22);
    doc.setTextColor(40, 167, 69);
    doc.text("NEET Mock Test Result", 105, 20, null, null, "center");

    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text(`Total Score: ${data.score} / 720`, 20, 40);
    doc.text(`Time Taken: ${data.time}`, 20, 50);
    doc.text(`Correct: ${data.correct}`, 20, 60);
    doc.text(`Incorrect: ${data.wrong}`, 20, 70);

    doc.setDrawColor(200);
    doc.line(20, 75, 190, 75);

    doc.setFontSize(14);
    doc.setTextColor(220, 53, 69);
    doc.text("Incorrect Answer Key", 20, 85);

    let y = 95;
    doc.setFontSize(10);
    doc.setTextColor(0);

    data.wrongLog.forEach(item => {
        if (y > 270) { doc.addPage(); y = 20; }
        doc.text(`Q${item.q}: You marked ${item.user} (Correct: ${item.correct})`, 20, y);
        y += 7;
    });

    doc.save("Result_Report.pdf");
}

function downloadQuestionPaper() {
    const link = document.createElement('a');
    link.href = 'paper.pdf';
    link.download = 'NEET_Question_Paper.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Start
init();