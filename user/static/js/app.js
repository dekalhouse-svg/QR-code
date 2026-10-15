const tabs = document.querySelectorAll(".tab");
const panels = document.querySelectorAll(".panel");

tabs.forEach(tab => {
    tab.addEventListener("click", () => {
        const panelId = tab.dataset.panel;

        tabs.forEach(item => item.classList.remove("active"));
        panels.forEach(panel => panel.classList.remove("active"));

        tab.classList.add("active");
        document.getElementById(panelId).classList.add("active");
    });
});


const generateBtn = document.getElementById("generateBtn");
const qrText = document.getElementById("qrText");
const qrResult = document.getElementById("qrResult");
const qrImage = document.getElementById("qrImage");
const downloadBtn = document.getElementById("downloadBtn");

generateBtn.addEventListener("click", async () => {
    const content = qrText.value.trim();

    if (!content) {
        alert("Veuillez entrer un texte ou une URL.");
        return;
    }

    generateBtn.disabled = true;
    generateBtn.textContent = "Génération…";

    try {
        const response = await fetch("/api/generate", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({content})
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Erreur de génération.");
        }

        qrImage.src = data.image;
        qrResult.style.display = "block";
    } catch (error) {
        alert(error.message);
    } finally {
        generateBtn.disabled = false;
        generateBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="7" height="7"/>
                <rect x="14" y="3" width="7" height="7"/>
                <rect x="3" y="14" width="7" height="7"/>
                <path d="M14 14h3v3h-3zM18 18h3v3h-3z"/>
            </svg>
            Générer le QR Code
        `;
    }
});


downloadBtn.addEventListener("click", () => {
    if (!qrImage.src) return;

    const link = document.createElement("a");
    link.href = qrImage.src;
    link.download = "qr-code.png";
    link.click();
});


/* ---------------- SCANNER ---------------- */

const cameraBtn = document.getElementById("cameraBtn");
const fileBtn = document.getElementById("fileBtn");
const fileInput = document.getElementById("fileInput");
const cameraArea = document.getElementById("cameraArea");
const cameraVideo = document.getElementById("cameraVideo");
const stopCameraBtn = document.getElementById("stopCameraBtn");
const scanStatus = document.getElementById("scanStatus");
const scanResult = document.getElementById("scanResult");
const scanValue = document.getElementById("scanValue");
const copyScanBtn = document.getElementById("copyScanBtn");

let cameraStream = null;
let scanAnimation = null;
let scanCanvas = document.createElement("canvas");
let scanContext = scanCanvas.getContext("2d", {willReadFrequently: true});


function showScanResult(value) {
    stopCamera();

    scanValue.textContent = value;
    scanResult.classList.remove("hidden");
}


async function openCamera() {
    scanResult.classList.add("hidden");

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("La caméra n'est pas disponible dans ce navigateur.");
        return;
    }

    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: {ideal: "environment"}
            },
            audio: false
        });

        cameraVideo.srcObject = cameraStream;
        cameraArea.classList.remove("hidden");
        await cameraVideo.play();

        scanStatus.textContent = "Recherche d'un QR Code…";
        scanFromCamera();
    } catch (error) {
        alert("Impossible d'ouvrir la caméra. Vérifiez l'autorisation du navigateur.");
    }
}


function scanFromCamera() {
    if (!cameraStream) return;

    if (cameraVideo.readyState >= 2) {
        scanCanvas.width = cameraVideo.videoWidth;
        scanCanvas.height = cameraVideo.videoHeight;

        scanContext.drawImage(
            cameraVideo,
            0,
            0,
            scanCanvas.width,
            scanCanvas.height
        );

        const imageData = scanContext.getImageData(
            0,
            0,
            scanCanvas.width,
            scanCanvas.height
        );

        if (typeof jsQR === "function") {
            const code = jsQR(
                imageData.data,
                imageData.width,
                imageData.height
            );

            if (code) {
                showScanResult(code.data);
                return;
            }
        }
    }

    scanAnimation = requestAnimationFrame(scanFromCamera);
}


function stopCamera() {
    if (scanAnimation) {
        cancelAnimationFrame(scanAnimation);
        scanAnimation = null;
    }

    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }

    cameraVideo.srcObject = null;
    cameraArea.classList.add("hidden");
}


cameraBtn.addEventListener("click", openCamera);
stopCameraBtn.addEventListener("click", stopCamera);


fileBtn.addEventListener("click", () => {
    fileInput.click();
});


fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];

    if (!file) return;

    if (typeof jsQR !== "function") {
        alert("Le scanner d'image n'est pas disponible.");
        return;
    }

    const image = new Image();

    image.onload = () => {
        scanCanvas.width = image.naturalWidth;
        scanCanvas.height = image.naturalHeight;

        scanContext.drawImage(
            image,
            0,
            0,
            scanCanvas.width,
            scanCanvas.height
        );

        const imageData = scanContext.getImageData(
            0,
            0,
            scanCanvas.width,
            scanCanvas.height
        );

        const code = jsQR(
            imageData.data,
            imageData.width,
            imageData.height
        );

        URL.revokeObjectURL(image.src);

        if (!code) {
            alert("Aucun QR Code détecté dans cette image.");
            return;
        }

        showScanResult(code.data);
    };

    image.src = URL.createObjectURL(file);
});


copyScanBtn.addEventListener("click", async () => {
    const value = scanValue.textContent;

    try {
        await navigator.clipboard.writeText(value);
        copyScanBtn.textContent = "Copié";
        setTimeout(() => {
            copyScanBtn.textContent = "Copier le résultat";
        }, 1500);
    } catch {
        alert("Impossible de copier automatiquement.");
    }
});


/* ---------------- PUBLICITÉS ---------------- */

let ads = [];
let adIndex = 0;
let adTimer = null;

async function loadAds() {
    const container = document.getElementById("adContainer");
    try {
        const response = await fetch("/api/ads", {cache: "no-store"});
        if (!response.ok) throw new Error("Impossible de charger les publicités.");
        ads = await response.json();
        if (!Array.isArray(ads) || ads.length === 0) {
            if (adTimer) clearTimeout(adTimer);
            container.innerHTML = '<span id="adPlaceholder">Espace publicitaire</span>';
            return;
        }
        showAd();
    } catch (error) {
        // Le générateur QR et le scanner restent utilisables si les pubs sont indisponibles.
        if (!container.querySelector("#adPlaceholder") && !container.querySelector(".ad-visit-link")) {
            container.innerHTML = '<span id="adPlaceholder">Espace publicitaire</span>';
        }
    }
}

function showAd() {
    const container = document.getElementById("adContainer");
    if (!ads.length) return;
    if (adTimer) clearTimeout(adTimer);

    const ad = ads[adIndex % ads.length];
    adIndex = (adIndex + 1) % ads.length;
    container.innerHTML = "";

    // click_url pointe vers le serveur admin qui compte la visite puis redirige.
    const visitLink = document.createElement("a");
    visitLink.className = "ad-visit-link";
    visitLink.href = ad.click_url || "#";
    visitLink.setAttribute("aria-label", "Visiter la publicité");
    if (!ad.click_url) {
        visitLink.addEventListener("click", event => event.preventDefault());
    }

    if (ad.type === "video") {
        const video = document.createElement("video");
        video.src = ad.url;
        video.autoplay = true;
        video.muted = true;
        video.loop = false;
        video.playsInline = true;
        video.setAttribute("aria-label", "Publicité");
        visitLink.appendChild(video);
        video.play().catch(() => {});
    } else {
        const img = document.createElement("img");
        img.src = ad.url;
        img.alt = "Publicité";
        img.onerror = () => {
            container.innerHTML = '<span id="adPlaceholder">Publicité indisponible</span>';
        };
        visitLink.appendChild(img);
    }

    const visitButton = document.createElement("span");
    visitButton.className = "ad-visit-button";
    visitButton.textContent = "Visiter";
    visitLink.appendChild(visitButton);
    container.appendChild(visitLink);

    const duration = Math.max(1, Number(ad.display_seconds) || 5);
    adTimer = setTimeout(showAd, duration * 1000);
}

loadAds();

/* ---------------- PWA ---------------- */

if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
}
