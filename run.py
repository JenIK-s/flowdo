"""Запуск FlowDo: окно приложения (pywebview) или, если его нет, браузер."""
import socket
import threading
import time
import webbrowser
import urllib.request

import uvicorn
from app.main import app


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def main():
    port = free_port()
    url = f"http://127.0.0.1:{port}"
    # log_config=None — иначе в режиме --windowed (без консоли) uvicorn падает на логировании
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_config=None))
    threading.Thread(target=server.run, daemon=True).start()
    for _ in range(100):  # ждём готовности сервера
        try:
            urllib.request.urlopen(url + "/api/tasks", timeout=0.3)
            break
        except Exception:
            time.sleep(0.1)
    try:
        import webview
        webview.settings["ALLOW_DOWNLOADS"] = True  # экспорт CSV/JSON из окна
        webview.create_window("FlowDo", url, width=900, height=760, min_size=(520, 480))
        webview.start()
    except ImportError:
        webbrowser.open(url)
        try:
            while True:
                time.sleep(3600)
        except KeyboardInterrupt:
            pass
    server.should_exit = True


if __name__ == "__main__":
    main()
