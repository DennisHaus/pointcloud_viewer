from pathlib import Path
from datetime import date
import json
import re
import subprocess


ROOT = Path(__file__).resolve().parents[1]
SCANS_DIR = ROOT / "scans"
CATALOG_FILE = ROOT / "catalog.json"

COPC_SUFFIX = ".copc.laz"


def normalize_path(value):
    value = str(value or "").replace("\\", "/")

    if value.startswith("./"):
        value = value[2:]

    return value


def slugify(value):
    value = re.sub(
        r"\.copc\.laz$",
        "",
        value,
        flags=re.IGNORECASE
    )

    value = re.sub(
        r"[^A-Za-z0-9]+",
        "-",
        value
    )

    return value.strip("-").lower() or "scan"


def human_name(filename):
    base = re.sub(
        r"\.copc\.laz$",
        "",
        filename,
        flags=re.IGNORECASE
    )

    base = re.sub(
        r"[-_]+",
        " ",
        base
    )

    return " ".join(
        word.capitalize()
        for word in base.split()
    )


def get_git_date(relative_path):
    try:
        result = subprocess.run(
            [
                "git",
                "log",
                "-1",
                "--format=%cs",
                "--",
                relative_path
            ],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False
        )

        git_date = result.stdout.strip()

        if git_date:
            return git_date

    except Exception:
        pass

    return date.today().isoformat()


def load_existing_catalog():
    if not CATALOG_FILE.exists():
        return {}

    try:
        with CATALOG_FILE.open(
            "r",
            encoding="utf-8"
        ) as file:
            data = json.load(file)

        scans = data.get("scans", [])

        return {
            normalize_path(scan.get("path")): scan
            for scan in scans
            if scan.get("path")
        }

    except Exception:
        return {}


def create_catalog():
    existing = load_existing_catalog()
    scans = []

    if not SCANS_DIR.exists():
        print("The scans folder does not exist.")
        return

    files = sorted(
        file
        for file in SCANS_DIR.rglob("*")
        if (
            file.is_file()
            and file.name.lower().endswith(COPC_SUFFIX)
        )
    )

    for file in files:
        relative_path = file.relative_to(ROOT).as_posix()
        catalog_path = "./" + relative_path

        previous = existing.get(
            normalize_path(catalog_path),
            {}
        )

        relative_without_suffix = re.sub(
            r"\.copc\.laz$",
            "",
            relative_path,
            flags=re.IGNORECASE
        )

        scan = {
            "id": previous.get(
                "id",
                slugify(relative_without_suffix)
            ),

            "name": previous.get(
                "name",
                human_name(file.name)
            ),

            "filename": file.name,

            "path": catalog_path,

            "url": catalog_path,

            "format": "copc",

            "sizeBytes": file.stat().st_size,

            
            #  Keep manually entered metadata if it already exists.
            #  New files get null values for these fields.

            "pointCount": previous.get(
                "pointCount",
                None
            ),

            "crs": previous.get(
                "crs",
                None
            ),

            "uploadedAt": previous.get(
                "uploadedAt",
                get_git_date(relative_path)
            )
        }

        scans.append(scan)

    catalog = {
        "version": 1,
        "scans": scans
    }

    with CATALOG_FILE.open(
        "w",
        encoding="utf-8"
    ) as file:
        json.dump(
            catalog,
            file,
            indent=2,
            ensure_ascii=False
        )

        file.write("\n")

    print(
        "Generated catalog.json with "
        + str(len(scans))
        + " scan(s)."
    )


if __name__ == "__main__":
    create_catalog()
