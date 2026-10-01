from pathlib import Path
from datetime import date
import json
import re
import subprocess


ROOT = Path(__file__).resolve().parents[1]
SCANS_DIR = ROOT / "scans"
CATALOG_FILE = ROOT / "catalog.json"


SUPPORTED_SUFFIXES = (
    ".copc.laz",
    ".laz",
    ".las",
    ".png",
    ".jpg",
    ".jpeg",
    ".mp4",
    ".mov",
)


def normalize_path(value):
    value = str(value or "").replace("\\", "/")

    if value.startswith("./"):
        value = value[2:]

    return value


def get_format(filename):
    lower_name = filename.lower()

    if lower_name.endswith(".png"):
        return "png"

    if (
        lower_name.endswith(".jpg") or
        lower_name.endswith(".jpeg")
    ):
        return "jpg"

    if lower_name.endswith(".mp4"):
        return "mp4"

    if lower_name.endswith(".mov"):
                return "mov"

    if lower_name.endswith(".copc.laz"):
        return "copc"

    if lower_name.endswith(".laz"):
        return "laz"

    if lower_name.endswith(".las"):
        return "las"

    return "unknown"


def remove_known_suffix(filename):
    lower_name = filename.lower()

    for suffix in (
        ".copc.laz",
        ".jpeg",
        ".jpg",
        ".png",
        ".laz",
        ".las",
        ".mp4",
        ".mov",
    ):
        if lower_name.endswith(suffix):
            return filename[
                :len(filename) - len(suffix)
            ]

    return filename


def slugify(value):
    value = remove_known_suffix(
        str(value or "")
    )

    value = re.sub(
        r"[^A-Za-z0-9]+",
        "-",
        value
    )

    return (
        value.strip("-").lower()
        or "scan"
    )


def human_name(filename):
    base = remove_known_suffix(
        filename
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

        scans = data.get(
            "scans",
            []
        )

        return {
            normalize_path(
                scan.get("path")
            ): scan
            for scan in scans
            if scan.get("path")
        }

    except Exception as error:
        print(
            "Could not read existing catalog:",
            error
        )

        return {}


def is_supported_file(file):
    if not file.is_file():
        return False

    filename = file.name.lower()

    return filename.endswith(
        SUPPORTED_SUFFIXES
    )


def create_catalog():
    existing = load_existing_catalog()

    scans = []

    if not SCANS_DIR.exists():
        print(
            "The scans folder does not exist."
        )

        return

    files = sorted(
        file
        for file in SCANS_DIR.rglob("*")
        if is_supported_file(file)
    )

    print(
        "Supported files found:",
        len(files)
    )

    for file in files:
        relative_path = (
            file.relative_to(ROOT)
            .as_posix()
        )

        catalog_path = (
            "./" + relative_path
        )

        previous = existing.get(
            normalize_path(
                catalog_path
            ),
            {}
        )

        file_format = get_format(
            file.name
        )

        scan = {
            "id": previous.get(
                "id",
                slugify(
                    relative_path
                )
            ),

            "name": previous.get(
                "name",
                human_name(
                    file.name
                )
            ),

            "filename": file.name,

            "path": catalog_path,

            "url": catalog_path,

            "format": file_format,

            "sizeBytes": file.stat().st_size,

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
                get_git_date(
                    relative_path
                )
            )
        }

        scans.append(scan)

        print(
            "Added:",
            relative_path,
            "(" + file_format + ")"
        )

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
        + " supported file(s)."
    )


if __name__ == "__main__":
    create_catalog()
