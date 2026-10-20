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
const clearQrBtn = document.getElementById("clearQrBtn");

function clearGeneratedQr() {
    qrImage.removeAttribute("src");
    qrResult.style.display = "none";
}

clearQrBtn.addEventListener("click", clearGeneratedQr);

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

const AD_STORAGE_KEY = "qr_code_cached_ads_v1";
const AD_PLACEHOLDER = '<span id="adPlaceholder">Espace publicitaire</span>';

let ads = [];
let adIndex = 0;
let adTimer = null;
let lastAdSignature = "";

function normalizeAds(value) {
    if (!Array.isArray(value)) return [];
    return value.filter(ad =>
        ad &&
        Number.isFinite(Number(ad.id)) &&
        typeof ad.url === "string" &&
        (ad.type === "image" || ad.type === "video")
    );
}

function adSignature(value) {
    return value.map(ad =>
        `${ad.id}|${ad.url}|${ad.type}|${ad.display_seconds}|${ad.click_url || ""}`
    ).join(";");
}

function readCachedAds() {
    try {
        const stored = JSON.parse(localStorage.getItem(AD_STORAGE_KEY) || "[]");
        return normalizeAds(stored);
    } catch {
        return [];
    }
}

function saveCachedAds(value) {
    try {
        localStorage.setItem(AD_STORAGE_KEY, JSON.stringify(value));
    } catch {
        // Si le stockage local est plein ou indisponible, les publicités en ligne fonctionnent quand même.
    }
}

async function cacheAdsMedia(value) {
    if (!("caches" in window)) return;
    try {
        const cache = await caches.open("qr-code-v3");
        await Promise.all(value.map(async ad => {
            try {
                const request = new Request(ad.url, { method: "GET" });
                const response = await fetch(request, { cache: "no-store" });
                if (response.ok) await cache.put(request, response.clone());
            } catch {
                // Le cache média est une amélioration hors connexion, pas une condition de fonctionnement.
            }
        }));
    } catch {
        // Le navigateur peut désactiver ou limiter le stockage local.
    }
}

async function loadAds() {
    const container = document.getElementById("adContainer");

    // Affiche tout de suite la dernière liste enregistrée, même hors connexion.
    const cachedAds = readCachedAds();
    if (cachedAds.length) {
        ads = cachedAds;
        lastAdSignature = adSignature(ads);
        adIndex = 0;
        showAd();
        cacheAdsMedia(cachedAds);
    }

    try {
        const response = await fetch("/api/ads", { cache: "no-store" });
        if (!response.ok) throw new Error("Impossible de charger les publicités.");

        const freshAds = normalizeAds(await response.json());
        const freshSignature = adSignature(freshAds);

        // Une réponse vide valide signifie qu'il n'y a actuellement aucune publicité active.
        if (freshAds.length === 0) {
            ads = [];
            lastAdSignature = "";
            if (adTimer) {
                clearTimeout(adTimer);
                adTimer = null;
            }
            try { localStorage.removeItem(AD_STORAGE_KEY); } catch {}
            container.innerHTML = AD_PLACEHOLDER;
            return;
        }

        saveCachedAds(freshAds);
        cacheAdsMedia(freshAds);

        // Ne redessine pas la même publicité inutilement si le cache correspond au serveur.
        if (freshSignature !== lastAdSignature) {
            ads = freshAds;
            lastAdSignature = freshSignature;
            adIndex = 0;
            showAd();
        } else {
            ads = freshAds;
        }
    } catch (error) {
        // En cas de panne, conserver la publicité déjà affichée depuis le cache.
        if (!ads.length) {
            container.innerHTML = AD_PLACEHOLDER;
        }
    }
}

function showAd() {
    const container = document.getElementById("adContainer");

    if (adTimer) {
        clearTimeout(adTimer);
        adTimer = null;
    }

    if (!ads.length) {
        container.innerHTML = AD_PLACEHOLDER;
        return;
    }

    const ad = ads[adIndex % ads.length];
    adIndex = (adIndex + 1) % ads.length;
    container.innerHTML = "";

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
        video.preload = "auto";
        video.setAttribute("aria-label", "Publicité");
        visitLink.appendChild(video);
        video.play().catch(() => {});
    } else {
        const img = document.createElement("img");
        img.src = ad.url;
        img.alt = "Publicité";
        img.onerror = () => {
            // Ne pas effacer la zone complète : la prochaine publicité pourra prendre sa place.
            img.alt = "Publicité indisponible";
        };
        visitLink.appendChild(img);
    }

    const visitButton = document.createElement("span");
    visitButton.className = "ad-visit-button";
    visitButton.textContent = "Visiter";
    visitLink.appendChild(visitButton);
    container.appendChild(visitLink);

    // Une publicité unique reste affichée sans limite de temps.
    // Plusieurs publicités se succèdent en boucle selon leur propre durée.
    if (ads.length > 1) {
        const duration = Math.max(1, Math.min(120, Number(ad.display_seconds) || 5));
        adTimer = setTimeout(showAd, duration * 1000);
    }
}

loadAds();

/* ---------------- PWA ---------------- */

if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
}
