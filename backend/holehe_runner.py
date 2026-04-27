"""
holehe_runner.py — Run holehe email scanner and return JSON results.
Usage: python holehe_runner.py <email>
Outputs: JSON array of site names where the email was found (only [+] lines).
"""

import subprocess
import sys
import json
import re


ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")


def _run_holehe_command(args):
    try:
        return subprocess.run(
            args,
            capture_output=True,
            text=True,
            timeout=90,
        )
    except FileNotFoundError:
        return subprocess.run(
            [sys.executable, "-m", "holehe", *args[1:]],
            capture_output=True,
            text=True,
            timeout=90,
        )


def _extract_sites(output):
    found = []

    for raw_line in output.splitlines():
        line = ANSI_RE.sub("", raw_line).strip()
        if not line or not line.startswith("[+]"):
            continue
        site = line.replace("[+]", "", 1).strip()
        site = re.split(r"\s+-\s+|\s+:\s+|\s{2,}", site, 1)[0].strip()
        site = re.sub(r"\s+\(.*\)$", "", site).strip()
        site = re.sub(r"\s+", " ", site).strip()
        if site and site not in found:
            found.append(site)

    return found


def run_holehe_clean(email):
    result = {"found": [], "error": None}

    try:
        proc = _run_holehe_command(["holehe", email, "--only-used", "--no-color"])

        if proc.stdout:
            sys.stderr.write(f"holehe stdout:\n{proc.stdout}\n")
        if proc.stderr:
            sys.stderr.write(f"holehe stderr:\n{proc.stderr}\n")

        combined_output = "\n".join([proc.stdout or "", proc.stderr or ""])
        result["found"] = _extract_sites(combined_output)

        stderr_text = proc.stderr or ""
        if proc.returncode != 0 and not result["found"]:
            if "No module named" in stderr_text and "holehe" in stderr_text:
                result["error"] = "holehe not installed — install it with: pip install holehe"
            else:
                result["error"] = f"holehe exited with code {proc.returncode}"

        return result

    except subprocess.TimeoutExpired:
        sys.stderr.write(f"holehe timed out for {email}\n")
        result["error"] = "holehe timed out"
        return result
    except FileNotFoundError:
        # holehe not installed
        sys.stderr.write("holehe not found — install it with: pip install holehe\n")
        result["error"] = "holehe not installed — install it with: pip install holehe"
        return result
    except Exception as e:
        sys.stderr.write(f"holehe error: {e}\n")
        result["error"] = f"holehe error: {e}"
        return result


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps([]))
        sys.exit(1)

    email = sys.argv[1]
    results = run_holehe_clean(email)
    print(json.dumps(results))
