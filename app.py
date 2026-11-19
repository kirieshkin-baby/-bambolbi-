import atexit
import os
from pathlib import Path
import secrets
import subprocess
import sys
import time
from http.client import HTTPConnection
from urllib.parse import quote, urlsplit

from flask import Flask, Response, request, send_from_directory

ROOT = Path(__file__).resolve().parent
MAX_SIZE = 30 * 1024 * 1024
app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_SIZE
api = None
api_port = None
api_token = secrets.token_hex(32)
server_mode = os.environ.get("BAMBOLBI_MODE") == "server"
if not server_mode:
    app.config["TRUSTED_HOSTS"] = ["127.0.0.1", "localhost"]


@app.after_request
def security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "same-origin"
    return response


@app.errorhandler(413)
def upload_too_large(_error):
    return {"error": "Размер файла превышает 30 МБ."}, 413


@app.route("/")
@app.route("/player")
def frontend():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/api/<path:path>", methods=["GET", "POST", "PATCH", "DELETE"])
@app.route("/media/<path:path>", methods=["GET"])
def proxy(path):
    if request.method in ("POST", "PATCH", "DELETE"):
        origin = request.headers.get("Origin")
        if request.headers.get("Sec-Fetch-Site") == "cross-site" or (origin and urlsplit(origin).netloc != request.host):
            return {"error": "Операция доступна только с этой страницы."}, 403
    connection = HTTPConnection("127.0.0.1", api_port, timeout=45)
    headers = {"X-Internal-Token": api_token}
    for key in ("Content-Type", "Content-Length", "Range"):
        if key in request.headers:
            headers[key] = request.headers[key]
    headers["X-Actor"] = request.headers.get("X-Bambolbi-User", "Администратор") if server_mode else "Администратор"
    # HTTP headers carry bytes, so encode the actor for the Node process.
    headers["X-Actor"] = quote(headers["X-Actor"])
    target = request.full_path.removesuffix("?")
    try:
        body = request.get_data() if request.method in ("POST", "PATCH") else None
        connection.request(request.method, target, body, headers)
        upstream = connection.getresponse()
    except OSError:
        connection.close()
        return {"error": "Сервер данных временно недоступен."}, 502

    def chunks():
        try:
            while chunk := upstream.read(65536):
                yield chunk
        finally:
            connection.close()

    skipped = {"connection", "keep-alive", "transfer-encoding", "date"}
    response = Response(chunks(), status=upstream.status,
                        headers=[(k, v) for k, v in upstream.getheaders() if k.lower() not in skipped])
    response.call_on_close(connection.close)
    return response


def stop_api():
    if api is not None and api.poll() is None:
        api.terminate()
        try:
            api.wait(timeout=5)
        except subprocess.TimeoutExpired:
            api.kill()
            api.wait()


def start_api():
    global api, api_port
    if not (ROOT / "static" / "app.js").is_file():
        sys.exit("Сначала соберите интерфейс: npm ci && npm run build")
    environment = {**os.environ, "BAMBOLBI_API_TOKEN": api_token, "BAMBOLBI_PYTHON": sys.executable}
    api = subprocess.Popen(["node", str(ROOT / "server.mjs")], cwd=ROOT, env=environment,
                           stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, encoding="utf-8")
    atexit.register(stop_api)
    address = api.stdout.readline().strip()
    if not address.isdecimal():
        sys.exit("Не удалось запустить API БАМБОЛБИ.")
    api_port = int(address)


if __name__ == "__main__":
    start_api()
    print("БАМБОЛБИ: http://127.0.0.1:5050", flush=True)
    if server_mode:
        from waitress import serve
        serve(app, host="0.0.0.0", port=5050, max_request_body_size=MAX_SIZE)
    else:
        app.run(host="127.0.0.1", port=5050, use_reloader=False)

