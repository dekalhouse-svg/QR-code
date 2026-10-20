import io
import os
from base64 import b64encode

import qrcode
import requests
from urllib.parse import urlparse

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass
from flask import Flask, Response, jsonify, render_template, request, send_from_directory

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

ADMIN_API_URL = os.environ.get(
    "ADMIN_API_URL",
    "https://qr-admin-srj2.onrender.com",
).rstrip("/")
INTERNAL_API_KEY = os.environ.get(
    "INTERNAL_API_KEY",
    "local-internal-key",
)

app = Flask(
    __name__,
    template_folder=os.path.join(BASE_DIR, "templates"),
    static_folder=os.path.join(BASE_DIR, "static"),
)


def notify_admin(event):
    try:
        requests.post(
            f"{ADMIN_API_URL}/internal/event",
            json={"event": event},
            headers={"X-Internal-Key": INTERNAL_API_KEY},
            timeout=3,
        )
    except requests.RequestException:
        pass


@app.route("/")
def index():
    notify_admin("visitor")
    return render_template("index.html")


@app.route("/manifest.json")
def manifest():
    return send_from_directory(app.static_folder, "manifest.json")


@app.route("/sw.js")
def service_worker():
    response = send_from_directory(app.static_folder, "sw.js")
    response.headers["Service-Worker-Allowed"] = "/"
    response.headers["Cache-Control"] = "no-cache"
    return response


@app.post("/api/generate")
def api_generate():
    data = request.get_json(silent=True) or {}
    content = str(data.get("content", "")).strip()

    if not content:
        return jsonify({"error": "Contenu vide."}), 400

    if len(content) > 4000:
        return jsonify({"error": "Le contenu est trop long."}), 400

    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=4,
    )
    qr.add_data(content)
    qr.make(fit=True)

    img = qr.make_image(
        fill_color="#111827",
        back_color="white",
    )

    buffer = io.BytesIO()
    img.save(buffer, format="PNG")

    notify_admin("qr_generated")

    return jsonify(
        {
            "image": (
                "data:image/png;base64,"
                + b64encode(buffer.getvalue()).decode("ascii")
            )
        }
    )


@app.get("/api/ads")
def api_ads():
    try:
        response = requests.get(
            f"{ADMIN_API_URL}/public/ads",
            timeout=5,
        )
        response.raise_for_status()
        ads = response.json()
        if not isinstance(ads, list):
            raise ValueError("Réponse publicitaire invalide.")

        # Les médias passent par le même domaine que l'application :
        # le Service Worker peut ainsi les conserver pour le mode hors connexion.
        for ad in ads:
            if isinstance(ad, dict) and ad.get("id") is not None:
                ad["url"] = f"/api/ad-media/{int(ad['id'])}"

        return jsonify(ads)
    except (requests.RequestException, ValueError, TypeError):
        # Une erreur réseau doit être distinguée d'une liste réellement vide.
        return jsonify({"error": "Publicités temporairement indisponibles."}), 503


@app.get("/api/ad-media/<int:ad_id>")
def api_ad_media(ad_id):
    """Proxy de média publicitaire pour permettre au Service Worker de le mettre en cache."""
    try:
        response = requests.get(f"{ADMIN_API_URL}/public/ads", timeout=5)
        response.raise_for_status()
        ads = response.json()
        ad = next(
            (item for item in ads if isinstance(item, dict) and int(item.get("id", -1)) == ad_id),
            None,
        )
        if not ad or not ad.get("url"):
            return jsonify({"error": "Publicité introuvable."}), 404

        media_url = urlparse(str(ad["url"]))
        trusted_url = urlparse(ADMIN_API_URL)
        if (
            media_url.scheme not in {"http", "https"}
            or media_url.netloc != trusted_url.netloc
        ):
            return jsonify({"error": "Adresse du média invalide."}), 400

        media_response = requests.get(media_url.geturl(), timeout=15)
        media_response.raise_for_status()
        content_type = media_response.headers.get("Content-Type", "application/octet-stream")
        return Response(
            media_response.content,
            status=200,
            content_type=content_type,
            headers={
                "Cache-Control": "public, max-age=3600",
                "X-Content-Type-Options": "nosniff",
            },
        )
    except (requests.RequestException, ValueError, TypeError):
        return jsonify({"error": "Média publicitaire indisponible."}), 502


@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "service": "user"})


if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 5072)),
        debug=os.environ.get("FLASK_DEBUG", "0") == "1",
    )
