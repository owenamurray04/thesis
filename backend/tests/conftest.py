"""Make ``ose`` importable from the src layout without installing (dev convenience).

When the package is installed via ``uv pip install -e .`` this is unnecessary, but it
keeps ``pytest`` runnable straight from a clone.
"""

import sys
from pathlib import Path

SRC = Path(__file__).resolve().parents[1] / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))
