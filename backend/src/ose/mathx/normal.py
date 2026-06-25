"""Standard normal PDF/CDF.

Uses ``scipy.special.ndtr`` (fast, vectorized, the proper tool) when available, with an
exact ``math.erf`` fallback so the core kernel has a zero-dependency path too. Both are
accurate to machine precision; ndtr is just faster on large grids.
"""

from __future__ import annotations

import math

import numpy as np

_INV_SQRT_2PI = 1.0 / math.sqrt(2.0 * math.pi)
_SQRT2 = math.sqrt(2.0)

try:  # preferred: scipy's vectorized normal CDF
    from scipy.special import ndtr as _ndtr

    def norm_cdf(x: np.ndarray | float) -> np.ndarray | float:
        """Standard normal CDF N(x)."""
        return _ndtr(np.asarray(x, dtype=float))

except ImportError:  # exact fallback, no scipy required
    _erf_vec = np.vectorize(math.erf, otypes=[float])

    def norm_cdf(x: np.ndarray | float) -> np.ndarray | float:
        """Standard normal CDF N(x)."""
        return 0.5 * (1.0 + _erf_vec(np.asarray(x, dtype=float) / _SQRT2))


def norm_pdf(x: np.ndarray | float) -> np.ndarray | float:
    """Standard normal PDF phi(x)."""
    x = np.asarray(x, dtype=float)
    return _INV_SQRT_2PI * np.exp(-0.5 * x * x)
