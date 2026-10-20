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
    
    # Open default web browser
    webbrowser.open(f"http://localhost:{PORT}")
    
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print("Web server running. Press Ctrl+C to stop.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")

if __name__ == "__main__":
    main()
