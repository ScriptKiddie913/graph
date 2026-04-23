"""
holehe_runner.py — Run holehe email scanner and return JSON results.
Usage: python holehe_runner.py <email>
Outputs: JSON array of site names where the email was found (only [+] lines).
"""

import subprocess
import sys
import json


def run_holehe_clean(email):
    try:
        proc = subprocess.run(
            ["holehe", email, "--only-used", "--no-color"],
            capture_output=True,
            text=True,
            timeout=90,
        )

        if proc.stdout:
            sys.stderr.write(f"holehe stdout:\n{proc.stdout}\n")
        if proc.stderr:
            sys.stderr.write(f"holehe stderr:\n{proc.stderr}\n")

        found = []

        for line in proc.stdout.splitlines():
            line = line.strip()
            if line.startswith("[+]"):
                site = line.replace("[+] ", "").strip()
                if site and site not in found:
                    found.append(site)

        return found

    except subprocess.TimeoutExpired:
        sys.stderr.write(f"holehe timed out for {email}\n")
        return []
    except FileNotFoundError:
        # holehe not installed
        sys.stderr.write("holehe not found — install it with: pip install holehe\n")
        return []
    except Exception as e:
        sys.stderr.write(f"holehe error: {e}\n")
        return []


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps([]))
        sys.exit(1)

    email = sys.argv[1]
    results = run_holehe_clean(email)
    print(json.dumps(results))
