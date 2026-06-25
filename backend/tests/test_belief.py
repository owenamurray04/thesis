"""Golden tests for the two-piece lognormal belief (design doc 3.2 / 9.5)."""

import math

import numpy as np
import pytest

from ose.mathx.belief import (
    Belief,
    belief_on_grid,
    build_grid,
    two_piece_lognormal_pdf,
)


def _mass_below(grid, f, level):
    dS = np.gradient(grid)
    return float(np.sum((f * dS)[grid <= level]))


def test_normalizes_to_one():
    b = Belief(m=100.0, sigma_down=0.25, sigma_up=0.25, T_days=30)
    grid = build_grid(b, n=2000)
    f = belief_on_grid(b, grid)
    assert np.sum(f * np.gradient(grid)) == pytest.approx(1.0, abs=1e-6)


def test_symmetric_reduces_to_lognormal_median_at_center():
    # With sigma_down == sigma_up the split lognormal IS an ordinary lognormal,
    # whose median is exp(mu) = m -> 50% of mass sits below the center.
    b = Belief(m=100.0, sigma_down=0.30, sigma_up=0.30, T_days=30)
    grid = build_grid(b, n=4000)
    f = belief_on_grid(b, grid)
    assert _mass_below(grid, f, 100.0) == pytest.approx(0.5, abs=2e-3)


def test_center_is_the_mode_not_the_median_when_skewed():
    # IMPORTANT (see docs/decisions-open.md, D22): for a split lognormal the center m is
    # the MODE. Mass below the center = sigma_down / (sigma_down + sigma_up), which is
    # only 0.5 when the two widths are equal. The design doc currently labels m the
    # 'median'; that label is exact only in the symmetric case.
    sd, su = 0.20, 0.40
    b = Belief(m=100.0, sigma_down=sd, sigma_up=su, T_days=30)
    grid = build_grid(b, n=8000)
    f = belief_on_grid(b, grid)
    assert _mass_below(grid, f, 100.0) == pytest.approx(sd / (sd + su), abs=3e-3)


def test_density_is_single_peaked():
    b = Belief(m=120.0, sigma_down=0.2, sigma_up=0.35, T_days=45)
    grid = build_grid(b, n=2000)
    f = belief_on_grid(b, grid)
    peak = int(np.argmax(f))
    # non-decreasing up to the peak, non-increasing after (single peak)
    assert np.all(np.diff(f[: peak + 1]) >= -1e-12)
    assert np.all(np.diff(f[peak:]) <= 1e-12)


def test_skew_caps_and_floor_applied():
    b = Belief(m=100.0, sigma_down=1e-9, sigma_up=10.0, T_days=10).clamped()
    assert b.sigma_down >= 1e-3            # floor
    assert b.sigma_up / b.sigma_down <= 6.0 + 1e-9  # skew cap


def test_grid_covers_required_strikes():
    b = Belief(m=100.0, sigma_down=0.1, sigma_up=0.1, T_days=10)
    strikes = np.array([40.0, 250.0])  # far outside +/-4 sigma
    grid = build_grid(b, n=500, must_cover=strikes)
    assert grid[0] <= 40.0 and grid[-1] >= 250.0
