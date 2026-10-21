"""
Nigeria Digital Divide — Web Platform Launcher
Serves the web dashboard at http://localhost:8000 and opens it in your browser.
"""

import http.server
import socketserver
import webbrowser
from pathlib import Path

PORT = 8000
WEB_DIR = Path(__file__).parent / "outputs" / "web"

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_DIR), **kwargs)

def main():
    print(f"Serving web application from {WEB_DIR}")
    print(f"Opening browser at: http://localhost:{PORT}")
    
    webbrowser.open(f"http://localhost:{PORT}")
    
    # Allow port reuse in case server was recently closed
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"Web server running on http://localhost:{PORT}. Press Ctrl+C to stop.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")

if __name__ == "__main__":
    main()

